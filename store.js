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
    try {
        // Busca usando a exata estrutura de URL pedida com o filtro "vendido-por"
        const response = await fetch(`/api/rihappy/${ean}/rihappy?map=ft,vendido-por`);
        if (!response.ok) return null;
        
        const html = await response.text();
        
        // 1. Tentar pegar do og:image (ocorre quando a busca redireciona direto pro produto exato)
        const ogMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
        if (ogMatch && ogMatch[1] && !ogMatch[1].includes('logo')) {
            return ogMatch[1];
        }

        // 2. Tentar pegar direto do cache JSON injetado pelo VTEX IO na página de busca
        const imgMatch = html.match(/"imageUrl":"(https:\/\/[^"]+\/arquivos\/ids\/[^"]+)"/i);
        if (imgMatch && imgMatch[1]) {
            return imgMatch[1];
        }

    } catch (e) {
        console.error('Erro no auto-scrape da RiHappy:', e);
    }
    return null;
}
