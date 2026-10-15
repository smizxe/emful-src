import puppeteer from 'puppeteer';

export async function scrapeEgfulfill(email: string, password: string) {
    const browser = await puppeteer.launch({
        headless: true, // Set to false to see it in action
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();

    try {
        // 1. Login
        await page.goto('https://egfulfill.com/auth/login', { waitUntil: 'networkidle2' });

        await page.type('input[type="email"]', email);
        await page.type('input[type="password"]', password);

        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2' }),
            page.click('button[type="submit"]'), // Adjust selector if needed
        ]);

        // Check if login failed
        if (page.url().includes('/login')) {
            throw new Error('Login failed. Check credentials.');
        }

        // 2. Scrape Dashboard Stats
        // Data is likely in Cards. We need to inspect the DOM structure from my previous analysis.
        // Based on previous screenshots, I'll attempt generic selectors or assume text content matching.
        const stats: any[] = [];

        // Evaluate page content to find stats
        const dashboardData = await page.evaluate(() => {
            const stats: any[] = [];
            // This is a heuristic: finding elements that look like stat cards
            // In AntD, these are usually .ant-card
            const cards = document.querySelectorAll('.ant-card');
            cards.forEach(card => {
                const titleEl = card.querySelector('.ant-statistic-title');
                const valueEl = card.querySelector('.ant-statistic-content-value');
                if (titleEl && valueEl) {
                    stats.push({
                        title: titleEl.textContent?.trim(),
                        value: valueEl.textContent?.trim(),
                    });
                }
            });
            return stats;
        });

        // 3. Scrape Orders
        await page.goto('https://egfulfill.com/dashboard/orders', { waitUntil: 'networkidle2' });

        const ordersData = await page.evaluate(() => {
            const rows = document.querySelectorAll('.ant-table-tbody > tr');
            const orders: any[] = [];
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length > 5) { // Ensure enough columns
                    orders.push({
                        orderId: cells[0]?.textContent?.trim(), // Adjust index based on real table
                        status: cells[1]?.textContent?.trim(),
                        source: cells[2]?.textContent?.trim(),
                        total: cells[3]?.textContent?.trim(),
                        dateCreated: cells[4]?.textContent?.trim(),
                        trackingId: cells[5]?.textContent?.trim(),
                    });
                }
            });
            return orders;
        });

        return {
            success: true,
            stats: dashboardData,
            orders: ordersData
        };

    } catch (error) {
        console.error('Scraping failed:', error);
        return { success: false, error: (error as Error).message };
    } finally {
        await browser.close();
    }
}
