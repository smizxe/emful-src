import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getAuthenticatedUser } from '@/lib/auth-guard';
import { transformEtsyRows } from '@/lib/etsyImport';
import { loadEtsyMaps } from '@/lib/etsyMaps';

// Convert a raw Etsy "Sold Order Items" export into a ready-to-fill emfulfill
// import template (.xlsx). Everything that can be derived is pre-filled — order,
// address, garment SKU (via style map), color/size, seller SKU and the buyer's
// personalization (in NOTE). The seller then fills the per-order design/print
// positions and imports the file.
//
// The output is built FROM the real template file (public/…template.xlsx) by
// injecting data rows into its first sheet. This keeps the output byte-identical
// to the template in every way that matters: the exact column order (POSITION
// before DESIGN), the Position/SKU/Type dropdowns (data validations), Sheet2's
// reference lists, and cell styles. We only replace <sheetData>, leaving the
// validation extension list untouched.

const TEMPLATE_PATH = join(process.cwd(), 'public', 'emfulfill_order_import_template.xlsx');

// Same 27 columns / order as the template — used for the CSV ("Google Sheet")
// output, which is data-only for pasting into the Google Sheet template.
const TEMPLATE_HEADERS = [
    'ORDER ID', 'PRODUCT SKU', 'QUANTITY', 'COLOR', 'SIZE',
    'SHIPPING NAME', 'SHIPPING PHONE', 'SHIPPING ADDRESS', 'SELLER SKU', 'TRACKING NUMBER', 'NOTE',
    'POSITION 1', 'DESIGN 1', 'MOCKUP 1', 'TYPE 1',
    'POSITION 2', 'DESIGN 2', 'MOCKUP 2', 'TYPE 2',
    'POSITION 3', 'DESIGN 3', 'MOCKUP 3', 'TYPE 3',
    'POSITION 4', 'DESIGN 4', 'MOCKUP 4', 'TYPE 4',
];

function buildAddress(r: any): string {
    const lines: string[] = [];
    if (r.address1) lines.push(r.address1);
    if (r.address2) lines.push(r.address2);
    const cityLine = [r.city, [r.state, r.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    if (cityLine) lines.push(cityLine);
    if (r.country) lines.push(r.country);
    return lines.join('\n');
}

function esc(s: unknown): string {
    return String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\r\n|\r|\n/g, '&#10;');
}

// 1-based column index -> spreadsheet column letter (1->A, 27->AA).
function colLetter(n: number): string {
    let s = '';
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
    return s;
}

const textCell = (ref: string, val: unknown) => `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(val)}</t></is></c>`;
const numCell = (ref: string, val: number) => `<c r="${ref}"><v>${val}</v></c>`;

export async function POST(request: Request) {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    if (!user.sellerId) return NextResponse.json({ error: 'Seller account required' }, { status: 403 });
    const sellerId = user.sellerId;

    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        // 'csv' -> data-only CSV for pasting into the Google Sheet template;
        // anything else -> the full .xlsx built from the Excel template (dropdowns).
        const format = String(formData.get('format') || 'xlsx').trim().toLowerCase();

        // Parse the raw Etsy export and map it to internal rows.
        const buffer = Buffer.from(await file.arrayBuffer());
        const wb = XLSX.read(buffer, { type: 'buffer' });
        const rawJson = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { raw: true, defval: '' });
        const maps = await loadEtsyMaps(sellerId);
        const internal = transformEtsyRows(rawJson as any[], maps);

        // --- CSV output (Google Sheet): data only, same column order as template ---
        if (format === 'csv') {
            const aoa: any[][] = [TEMPLATE_HEADERS];
            for (const r of internal) {
                const row = new Array(TEMPLATE_HEADERS.length).fill('');
                row[0] = r.orderid;
                row[1] = r.productsku || r.style || '';
                row[2] = r.quantity;
                row[3] = r.color;
                row[4] = r.size;
                row[5] = r.shippingname;
                row[6] = r.shippingphone;
                row[7] = buildAddress(r);
                row[8] = r.sellersku;
                row[10] = r.note;
                row[11] = r.position1 || '';
                row[12] = r.design1 || '';
                row[13] = r.design1 ? (r.mockup1 || '') : '';
                row[14] = r.design1 ? (r.type1 || 'Embroidery') : '';
                aoa.push(row);
            }
            const csvSheet = XLSX.utils.aoa_to_sheet(aoa);
            const csv = XLSX.utils.sheet_to_csv(csvSheet);
            // Prepend a UTF-8 BOM so Excel/Sheets read accents correctly.
            return new NextResponse('﻿' + csv, {
                status: 200,
                headers: {
                    'Content-Type': 'text/csv; charset=utf-8',
                    'Content-Disposition': 'attachment; filename="emfulfill_from_etsy.csv"',
                },
            });
        }

        // Load the template workbook and inject the data rows into sheet1.
        const zip = await JSZip.loadAsync(readFileSync(TEMPLATE_PATH));
        const sheetPath = 'xl/worksheets/sheet1.xml';
        const sheetFile = zip.file(sheetPath);
        if (!sheetFile) throw new Error('Template worksheet missing');
        const sheetXml = await sheetFile.async('string');

        // Keep the template's header row (row 1) verbatim — it references the
        // template's shared strings and carries the exact column titles/order.
        const headerMatch = sheetXml.match(/<row r="1"[\s\S]*?<\/row>/);
        const headerRow = headerMatch ? headerMatch[0] : '';

        // Column layout matches the template: A ORDER ID, B PRODUCT SKU, C QTY,
        // D COLOR, E SIZE, F SHIP NAME, G SHIP PHONE, H SHIP ADDRESS, I SELLER SKU,
        // J TRACKING, K NOTE, then L/M/N/O = POSITION1/DESIGN1/MOCKUP1/TYPE1.
        const dataRows = internal.map((r, i) => {
            const rn = i + 2;
            const cells: string[] = [];
            const addr = buildAddress(r);
            const T = (colIdx: number, val: unknown) => { const v = String(val ?? ''); if (v !== '') cells.push(textCell(colLetter(colIdx) + rn, v)); };
            const N = (colIdx: number, val: unknown) => { const n = Number(val); if (val !== '' && val != null && !Number.isNaN(n)) cells.push(numCell(colLetter(colIdx) + rn, n)); };

            T(1, r.orderid);
            // No blank mapping -> show the raw style (e.g. "Sweatshirt") so the
            // seller sees what to correct, instead of leaving it empty.
            T(2, r.productsku || r.style || '');
            N(3, r.quantity);
            T(4, r.color);
            T(5, r.size);
            T(6, r.shippingname);
            T(7, r.shippingphone);
            T(8, addr);
            T(9, r.sellersku);
            // J (tracking) intentionally blank
            T(11, r.note);
            // Design columns pre-filled only when a mapping exists; otherwise blank.
            T(12, r.position1 || '');
            T(13, r.design1 || '');
            T(14, r.design1 ? (r.mockup1 || '') : '');
            T(15, r.design1 ? (r.type1 || 'Embroidery') : '');
            return `<row r="${rn}">${cells.join('')}</row>`;
        }).join('');

        let newSheetXml = sheetXml.replace(/<sheetData>[\s\S]*?<\/sheetData>/, `<sheetData>${headerRow}${dataRows}</sheetData>`);
        newSheetXml = newSheetXml.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:AA${internal.length + 1}"/>`);
        // The template's sample rows carried cell hyperlinks to sample Google Drive
        // files (Design/Mockup). Those live in a <hyperlinks> element that survives
        // the sheetData swap, so mapped cells would keep opening the sample file
        // (and showing its "NURSE" content). Strip them — our design/mockup values
        // are written as plain text.
        newSheetXml = newSheetXml.replace(/<hyperlinks>[\s\S]*?<\/hyperlinks>/, '');
        zip.file(sheetPath, newSheetXml);

        // Also drop the matching external hyperlink relationships so Excel doesn't
        // warn about (or keep) links to the sample files.
        const relsPath = 'xl/worksheets/_rels/sheet1.xml.rels';
        const relsFile = zip.file(relsPath);
        if (relsFile) {
            const relsXml = (await relsFile.async('string'))
                .replace(/<Relationship\b[^>]*TargetMode="External"[^>]*\/>/g, '');
            zip.file(relsPath, relsXml);
        }

        const outBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

        return new NextResponse(outBuf as unknown as BodyInit, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': 'attachment; filename="emfulfill_from_etsy.xlsx"',
            },
        });
    } catch (e: any) {
        console.error('Etsy template export error:', e);
        return NextResponse.json({ error: e.message || 'Failed to convert file' }, { status: 500 });
    }
}
