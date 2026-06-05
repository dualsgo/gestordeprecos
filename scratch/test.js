async function testScrape() {
    const ean = '5145247';
    const proxyUrl = 'http://localhost:5173/api/rihappy/' + ean + '/rihappy?map=ft,vendido-por';

    try {
        const response = await fetch(proxyUrl);
        console.log('Status: ' + response.status);
        if (!response.ok) return;
        
        const html = await response.text();
        console.log('HTML length:', html.length);
        
        const searchImgMatch = html.match(/<img[^>]+src="([^"]+)"[^>]+class="[^"]*vtex-product-summary-2-x-imageNormal[^"]*"[^>]*>/i) ||
                               html.match(/<img[^>]+class="[^"]*vtex-product-summary-2-x-imageNormal[^"]*"[^>]+src="([^"]+)"[^>]*>/i) ||
                               html.match(/src="([^"]+\/arquivos\/ids\/[^"]+)"/i);

        if (searchImgMatch) {
            console.log('Image match:', searchImgMatch[1]);
        }
    } catch(e) {
        console.error('Error:', e.message);
    }
}
testScrape();
