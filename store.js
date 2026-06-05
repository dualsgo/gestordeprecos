// store.js - Camada de Persistência Local

const STORE_KEY = 'atupreco_images_db';

export function getDatabase() {
    try {
        const data = localStorage.getItem(STORE_KEY);
        if (data) {
            return JSON.parse(data);
        }
    } catch (e) {
        console.error("Erro ao ler banco local", e);
    }
    return {};
}

export function saveDatabase(db) {
    try {
        localStorage.setItem(STORE_KEY, JSON.stringify(db));
    } catch (e) {
        console.error("Erro ao salvar no banco local", e);
    }
}

export function getProductImage(codInt) {
    const db = getDatabase();
    return db[codInt]?.image || null;
}

export function saveProductImage(codInt, imageUrl, productName) {
    const db = getDatabase();
    if (!db[codInt]) {
        db[codInt] = { nome: productName };
    }
    db[codInt].image = imageUrl;
    saveDatabase(db);
}

export function deleteProductImage(codInt) {
    const db = getDatabase();
    if (db[codInt]) {
        delete db[codInt].image;
        // Se ficar vazio, limpa a chave
        if (Object.keys(db[codInt]).length <= 1) {
            delete db[codInt];
        }
        saveDatabase(db);
    }
}

// Inferência de categoria para mostrar ícones úteis quando não tem foto
export function getCategoryIcon(productName) {
    const name = productName.toUpperCase();
    if (name.includes('LEGO') || name.includes('BLOCO')) return '🧱';
    if (name.includes('BONECA') || name.includes('BARBIE') || name.includes('BABY')) return '🧸';
    if (name.includes('CARRO') || name.includes('HOT WHEELS') || name.includes('PISTA')) return '🏎️';
    if (name.includes('JOGO') || name.includes('TABULEIRO') || name.includes('UNO')) return '🎲';
    if (name.includes('NERF') || name.includes('LANCADOR') || name.includes('LANÇADOR')) return '🔫';
    if (name.includes('PELUCIA')) return '🐻';
    if (name.includes('FANTASIA')) return '👗';
    if (name.includes('BOLA') || name.includes('ESPORTE')) return '⚽';
    return '📦'; // Default
}

// Scraper via Proxy local (Vite)
export async function scrapeImageFromRiHappy(ean) {
    if (!ean || ean === 'N/A' || ean === '-') return null;
    
    const targetUrl = encodeURIComponent(`https://www.rihappy.com.br/${ean}/rihappy?map=ft,vendido-por`);
    const proxies = [
        `https://api.allorigins.win/get?url=${targetUrl}`,
        `https://api.codetabs.com/v1/proxy?quest=https://www.rihappy.com.br/${ean}/rihappy?map=ft,vendido-por`
    ];

    for (const proxyUrl of proxies) {
        try {
            const response = await fetch(proxyUrl);
            if (!response.ok) continue;
            
            let html = '';
            if (proxyUrl.includes('allorigins')) {
                const data = await response.json();
                html = data.contents;
            } else {
                html = await response.text();
            }
            
            // 1. Tentar pegar do JSON-LD (Schema.org Product)
            const ldScripts = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
            if (ldScripts) {
                for (const script of ldScripts) {
                    if (script.includes('"@type":"Product"') || script.includes('"@type": "Product"')) {
                        const imgMatch = script.match(/"image":\s*"([^"]+)"/);
                        if (imgMatch && imgMatch[1]) {
                            return imgMatch[1];
                        }
                    }
                }
            }
            
            // 2. Tentar pegar do og:image
            const ogMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i) || 
                            html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i);
            if (ogMatch && ogMatch[1] && !ogMatch[1].includes('logo')) {
                return ogMatch[1];
            }

            // 3. Tentar pegar direto do cache JSON injetado pelo VTEX IO
            const imgMatch = html.match(/"imageUrl":"(https:\/\/[^"]+\/arquivos\/ids\/[^"]+)"/i) ||
                             html.match(/"image":"(https:\/\/[^"]+\/arquivos\/ids\/[^"]+)"/i);
            if (imgMatch && imgMatch[1]) {
                return imgMatch[1];
            }
        } catch (e) {
            console.error(`Erro no auto-scrape da RiHappy com proxy ${proxyUrl}:`, e);
        }
    }
    
    // Tentar fallback genérico se não achou na RiHappy
    return null;
}
