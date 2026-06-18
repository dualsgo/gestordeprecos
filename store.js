// store.js - Camada de Persistência Híbrida (Vercel KV + LocalStorage)

const STORE_KEY = 'atupreco_images_db';
let memoryDb = null;

// Inicializa lendo do Vercel KV e guarda na memória (chamado no início do main.js)
export async function initOnlineDatabase() {
    // 1. Tenta pegar o que tem no localStorage primeiro para a tela abrir rápido
    try {
        const localData = localStorage.getItem(STORE_KEY);
        if (localData) memoryDb = JSON.parse(localData);
    } catch (e) {}

    if (!memoryDb) memoryDb = {};

    // 2. Busca na nuvem a versão oficial
    try {
        const res = await fetch('/api/images');
        if (res.ok) {
            const data = await res.json();
            memoryDb = data;
            // Sincroniza o cache local
            localStorage.setItem(STORE_KEY, JSON.stringify(memoryDb));
            return true;
        }
    } catch (e) {
        console.warn("Aviso: Vercel KV não respondeu. Usando cache local.", e);
    }
    return false;
}

export function getDatabase() {
    if (memoryDb) return memoryDb;
    try {
        const data = localStorage.getItem(STORE_KEY);
        if (data) return JSON.parse(data);
    } catch (e) {}
    return {};
}

function saveLocalDatabase(db) {
    try {
        localStorage.setItem(STORE_KEY, JSON.stringify(db));
    } catch (e) {}
}

export function getProductImage(codInt) {
    const db = getDatabase();
    return db[codInt]?.image || null;
}

export function saveProductImage(codInt, imageUrl, productName) {
    // 1. Atualiza memória e localStorage na hora para ficar rápido pro usuário
    if (!memoryDb) memoryDb = getDatabase();
    if (!memoryDb[codInt]) memoryDb[codInt] = { nome: productName };
    memoryDb[codInt].image = imageUrl;
    saveLocalDatabase(memoryDb);

    // 2. Envia para o Vercel KV em background
    fetch('/api/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codInt, imageUrl, productName })
    }).catch(e => console.warn('Erro ao sincronizar imagem na nuvem:', e));
}

export function deleteProductImage(codInt) {
    // 1. Remove da memória e localStorage na hora
    if (!memoryDb) memoryDb = getDatabase();
    if (memoryDb[codInt]) {
        delete memoryDb[codInt].image;
        if (Object.keys(memoryDb[codInt]).length <= 1) {
            delete memoryDb[codInt];
        }
        saveLocalDatabase(memoryDb);
    }

    // 2. Remove do Vercel KV em background
    fetch(`/api/images?codInt=${codInt}`, { method: 'DELETE' })
      .catch(e => console.warn('Erro ao remover imagem da nuvem:', e));
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
export async function scrapeImageFromPBKids(queryId) {
    if (!queryId || queryId === 'N/A' || queryId === '-') return null;
    
    // Na PBKids, a busca por EAN ou Referência costuma funcionar com o termo exato
    const targetPath = `/${queryId}?_q=${queryId}&map=ft`;
    const targetUrl = encodeURIComponent(`https://www.pbkids.com.br${targetPath}`);
    const proxies = [
        `/api/pbkids${targetPath}`,
        `https://api.allorigins.win/get?url=${targetUrl}`,
        `https://api.codetabs.com/v1/proxy?quest=https://www.pbkids.com.br${targetPath}`
    ];

    const fetchProxy = async (proxyUrl) => {
        const response = await fetch(proxyUrl, { signal: AbortSignal.timeout(5000) });
        if (!response.ok) throw new Error("Erro na requisição ou status != 2xx");
        
        let html = '';
        if (proxyUrl.includes('allorigins')) {
            const data = await response.json();
            html = data.contents;
        } else {
            html = await response.text();
        }
        
        let imageUrl = null;
        let extractedEan = null;
        let extractedRef = null;

        // 1. Tentar pegar do JSON-LD (Schema.org Product)
        const ldScripts = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
        if (ldScripts) {
            for (const script of ldScripts) {
                if (script.includes('"@type":"Product"') || script.includes('"@type": "Product"')) {
                    const imgMatch = script.match(/"image":\s*"([^"]+)"/);
                    if (imgMatch && imgMatch[1]) imageUrl = imgMatch[1];
                    
                    const eanMatchJson = script.match(/"gtin":\s*"(\d+)"/);
                    if (eanMatchJson && eanMatchJson[1]) extractedEan = eanMatchJson[1];
                }
            }
        }
        
        // 2. Tentar pegar do og:image
        if (!imageUrl) {
            const ogMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i) || 
                            html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i);
            if (ogMatch && ogMatch[1] && !ogMatch[1].includes('logo')) {
                imageUrl = ogMatch[1];
            }
        }

        // 3. Tentar pegar direto do cache JSON injetado pelo VTEX IO
        if (!imageUrl) {
            const imgMatch = html.match(/"imageUrl":"(https:\/\/[^"]+\/arquivos\/ids\/[^"]+)"/i) ||
                             html.match(/"image":"(https:\/\/[^"]+\/arquivos\/ids\/[^"]+)"/i);
            if (imgMatch && imgMatch[1]) {
                imageUrl = imgMatch[1];
            }
        }

        // 4. Tentar pegar a imagem direto da vitrine de resultados de busca (VTEX)
        if (!imageUrl) {
            const searchImgMatch = html.match(/<img[^>]+src="([^"]+)"[^>]+class="[^"]*vtex-product-summary-2-x-imageNormal[^"]*"[^>]*>/i) ||
                                   html.match(/<img[^>]+class="[^"]*vtex-product-summary-2-x-imageNormal[^"]*"[^>]+src="([^"]+)"[^>]*>/i) ||
                                   html.match(/src="([^"]+\/arquivos\/ids\/[^"]+)"/i);
                                   
            if (searchImgMatch && searchImgMatch[1] && !searchImgMatch[1].includes('logo')) {
                imageUrl = searchImgMatch[1].replace(/&amp;/g, '&');
            }
        }

        // 5. Resgatar Referência e EAN do DOM
        if (!extractedRef) {
            const domRefMatch = html.match(/data-specification-name="Refer\u00eancia"[^>]*>.*?<\/span>.*?data-specification-value="([^"]+)"/i) ||
                                html.match(/data-specification-name="Referência"[^>]*>.*?<\/span>.*?data-specification-value="([^"]+)"/i);
            if (domRefMatch && domRefMatch[1]) {
                extractedRef = domRefMatch[1];
            }
        }
        
        if (!extractedEan) {
            const domEanMatch = html.match(/data-specification-name="C\u00f3digo de Barras" data-specification-value="(\d+)"/i) ||
                                html.match(/data-specification-name="C\u00f3digo de Barras"[^>]*>.*?<\/span>.*?data-specification-value="(\d+)"/i);
            if (domEanMatch && domEanMatch[1]) {
                extractedEan = domEanMatch[1];
            }
        }

        if (imageUrl) {
            return { imageUrl, ean: extractedEan, ref: extractedRef };
        }
        
        throw new Error("Imagem não encontrada na PBKids");
    };

    try {
        return await Promise.any(proxies.map(fetchProxy));
    } catch (e) {
        return null;
    }
}
