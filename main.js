import { getProductImage, saveProductImage, deleteProductImage, getCategoryIcon, scrapeImageFromPBKids, getDatabase, initOnlineDatabase } from './store.js';

// ─── Chaves de persistência ───────────────────────────────────────────
const CATALOG_KEY = 'atupreco_catalog_products';

function loadProducts() {
    try {
        const raw = localStorage.getItem(CATALOG_KEY);
        if (raw) return JSON.parse(raw);
    } catch (e) { console.error('Erro ao carregar produtos', e); }
    return [];
}

function saveProducts(products) {
    try {
        localStorage.setItem(CATALOG_KEY, JSON.stringify(products));
    } catch (e) { console.error('Erro ao salvar produtos', e); }
}

// ─── Estado global ────────────────────────────────────────────────────
let products = loadProducts();
let currentAddingImageCode = null;
let currentAddingImageName = null;
let currentAddingImageEan  = null;
let editingProductId = null;   // codInt do produto em edição (null = novo)

// ─── Referências DOM ──────────────────────────────────────────────────
const resultsContainer   = document.getElementById('results');
const btnPrint           = document.getElementById('btn-print');
const modal              = document.getElementById('image-modal');
const btnModalCancel     = document.getElementById('btn-modal-cancel');
const btnModalSave       = document.getElementById('btn-modal-save');
const imgUrlInput        = document.getElementById('img-url-input');
const searchHelperLinks  = document.getElementById('search-helper-links');

// ─── Modal "Adicionar / Editar Produto" ───────────────────────────────
const productModal = document.createElement('div');
productModal.id = 'product-modal';
productModal.className = 'modal hidden';
productModal.innerHTML = `
  <div class="modal-content" style="max-width:480px;">
    <h3 id="product-modal-title">➕ Adicionar Produto</h3>
    <p style="margin-bottom:16px;color:#666;">Preencha os dados do produto. Somente o <strong>Nome</strong> é obrigatório.</p>
    <label class="field-label">Nome do Produto *</label>
    <input type="text" id="pm-name" placeholder="Ex: LEGO Ninjago City" style="margin-bottom:12px;" />
    <label class="field-label">Código SAP (interno)</label>
    <input type="text" id="pm-sap" placeholder="Ex: 1234567" style="margin-bottom:12px;" />
    <label class="field-label">EAN (código de barras)</label>
    <input type="text" id="pm-ean" placeholder="Ex: 7891234567890" style="margin-bottom:12px;" />
    <label class="field-label">Código de Referência (fornecedor)</label>
    <input type="text" id="pm-ref" placeholder="Ex: ABC-001" style="margin-bottom:20px;" />
    <div class="modal-actions">
      <button id="btn-pm-cancel" class="btn-cancel">Cancelar</button>
      <button id="btn-pm-save" class="btn-save">Salvar Produto</button>
    </div>
  </div>
`;
document.body.appendChild(productModal);

function openProductModal(codInt = null) {
    editingProductId = codInt;
    const title = document.getElementById('product-modal-title');

    if (codInt) {
        const p = products.find(x => x.codInt === codInt);
        title.textContent = '✏️ Editar Produto';
        document.getElementById('pm-name').value = p?.mercadoria || '';
        document.getElementById('pm-sap').value  = p?.codInt || '';
        document.getElementById('pm-ean').value  = (p?.ean && p.ean !== 'N/A') ? p.ean : '';
        document.getElementById('pm-ref').value  = p?.fornecedorCod || '';
    } else {
        title.textContent = '➕ Adicionar Produto';
        document.getElementById('pm-name').value = '';
        document.getElementById('pm-sap').value  = '';
        document.getElementById('pm-ean').value  = '';
        document.getElementById('pm-ref').value  = '';
    }
    productModal.classList.remove('hidden');
    setTimeout(() => document.getElementById('pm-name').focus(), 50);
}

document.getElementById('btn-pm-cancel').addEventListener('click', () => {
    productModal.classList.add('hidden');
});

document.getElementById('btn-pm-save').addEventListener('click', () => {
    const name = document.getElementById('pm-name').value.trim();
    const sap  = document.getElementById('pm-sap').value.trim();
    const ean  = document.getElementById('pm-ean').value.trim();
    const ref  = document.getElementById('pm-ref').value.trim();

    if (!name) { alert('O nome do produto é obrigatório.'); return; }

    const codInt = sap || ('P' + Date.now());

    if (editingProductId) {
        const idx = products.findIndex(x => x.codInt === editingProductId);
        if (idx !== -1) {
            products[idx] = {
                ...products[idx],
                mercadoria:   name,
                codInt:       codInt,
                ean:          ean || 'N/A',
                fornecedorCod: ref || '-',
                fornecedor:   'MANUAL',
            };
        }
    } else {
        products.push({
            codInt,
            mercadoria:    name,
            ean:           ean || 'N/A',
            fornecedorCod: ref || '-',
            fornecedor:    'MANUAL',
            precoAnterior: 0,
            novoPreco:     0,
            estoque:       '0',
        });
    }

    saveProducts(products);
    productModal.classList.add('hidden');
    renderCatalog();
});

// ─── Excluir produto ──────────────────────────────────────────────────
window.deleteProduct = function(codInt) {
    if (!confirm('Tem certeza que deseja excluir este produto?')) return;
    products = products.filter(p => p.codInt !== codInt);
    saveProducts(products);
    renderCatalog();
};

// ─── Botão Adicionar na barra de ações ───────────────────────────────
const btnAdd = document.createElement('button');
btnAdd.id = 'btn-add-product';
btnAdd.className = 'btn-add-product';
btnAdd.innerHTML = '＋ Adicionar Produto';
btnAdd.addEventListener('click', () => openProductModal(null));

const btnUpdateImages = document.createElement('button');
btnUpdateImages.id = 'btn-update-images';
btnUpdateImages.className = 'btn-new';
btnUpdateImages.innerHTML = '🔄 Buscar Imagens';
btnUpdateImages.addEventListener('click', () => runAutoScraperInBackground());

const actionsWrapper = document.querySelector('.actions-wrapper');
if (actionsWrapper) {
    const rightActions = actionsWrapper.querySelector('.right-actions');
    if (rightActions) {
        rightActions.prepend(btnAdd);
        rightActions.prepend(btnUpdateImages);
    }
}

// ─── Impressão ────────────────────────────────────────────────────────
if (btnPrint) {
    btnPrint.addEventListener('click', () => {
        if (window.generatePrintReport) window.generatePrintReport();
    });
}

// ─── Lightbox ─────────────────────────────────────────────────────────
window.openLightbox = function(imgSrc, caption) {
    const lb = document.getElementById('lightbox');
    const lbImg = document.getElementById('lightbox-img');
    const lbCaption = document.getElementById('lightbox-caption');
    if (!lb) return;
    lbImg.src = imgSrc;
    lbCaption.textContent = caption || '';
    lb.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
};
window.closeLightbox = function() {
    const lb = document.getElementById('lightbox');
    if (!lb) return;
    lb.classList.add('hidden');
    document.body.style.overflow = '';
};
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.closeLightbox(); });

// ─── Modal de Imagem ──────────────────────────────────────────────────
window.openImageModal = function(codInt, productName, ean) {
    currentAddingImageCode = codInt;
    currentAddingImageName = productName;
    currentAddingImageEan  = ean;
    imgUrlInput.value = '';

    const statusDiv = document.getElementById('modal-scrape-status');
    if (statusDiv) statusDiv.textContent = '';

    const query       = encodeURIComponent(productName);
    const googleLink  = `<a href="https://www.google.com/search?tbm=isch&q=${query}" target="_blank">🔍 Buscar no Google Imagens</a>`;
    const rihappyQuery = (ean && ean !== 'N/A' && ean !== '-') ? ean : codInt;
    const rihappyLink  = `<a href="https://www.pbkids.com.br/${rihappyQuery}/pbkids?map=ft" target="_blank">🧸 Buscar na PBKids</a>`;
    searchHelperLinks.innerHTML = `${googleLink} ${rihappyLink}`;

    const btnDelete = document.getElementById('btn-modal-delete');
    if (btnDelete) btnDelete.style.display = getProductImage(codInt) ? 'block' : 'none';

    modal.classList.remove('hidden');
};

function closeImageModal() { modal.classList.add('hidden'); }

btnModalCancel.addEventListener('click', () => modal.classList.add('hidden'));
btnModalSave.addEventListener('click', () => {
    const url = imgUrlInput.value.trim();
    if (url && currentAddingImageCode) {
        saveProductImage(currentAddingImageCode, url, currentAddingImageName);
        renderCatalog();
    }
    closeImageModal();
});

const btnModalAutoSearch = document.getElementById('btn-modal-auto-search');
if (btnModalAutoSearch) {
    btnModalAutoSearch.addEventListener('click', async () => {
        if (!currentAddingImageCode) return;
        const statusDiv = document.getElementById('modal-scrape-status');
        statusDiv.textContent = '⏳ Buscando imagem no site... aguarde.';
        statusDiv.style.color = '#f59e0b';
        const queryId = (currentAddingImageEan && currentAddingImageEan !== 'N/A' && currentAddingImageEan !== '-')
            ? currentAddingImageEan : currentAddingImageCode;
        const result = await scrapeImageFromPBKids(queryId);
        if (result && result.imageUrl) {
            statusDiv.textContent = '✅ Imagem encontrada!';
            statusDiv.style.color = '#10b981';
            imgUrlInput.value = result.imageUrl;
            saveProductImage(currentAddingImageCode, result.imageUrl, currentAddingImageName);
            renderCatalog();
            setTimeout(closeImageModal, 1000);
        } else {
            statusDiv.textContent = '❌ Imagem não encontrada. Tente os links abaixo ou informe a URL manualmente.';
            statusDiv.style.color = '#ef4444';
        }
    });
}

const btnModalDelete = document.getElementById('btn-modal-delete');
if (btnModalDelete) {
    btnModalDelete.addEventListener('click', () => {
        if (currentAddingImageCode) {
            deleteProductImage(currentAddingImageCode);
            renderCatalog();
        }
        closeImageModal();
    });
}

// ─── Renderização do catálogo ─────────────────────────────────────────
function renderCatalogCard(item) {
    const savedImg   = getProductImage(item.codInt);
    const escapedName = item.mercadoria.replace(/'/g, "\\'");
    const eanText    = (item.ean && item.ean !== 'N/A' && item.ean !== '-') ? item.ean : 'Sem EAN';

    let imgHtml = '';
    if (savedImg) {
        imgHtml = `<img src="${savedImg}" onclick="openLightbox('${savedImg}', '${escapedName}')" title="Ver imagem" />
                   <button class="catalog-edit-img-btn" onclick="event.stopPropagation(); openImageModal('${item.codInt}', '${escapedName}', '${item.ean}')" title="Trocar imagem">✎</button>`;
    } else {
        const icon = getCategoryIcon(item.mercadoria);
        imgHtml = `<div class="catalog-no-image" onclick="openImageModal('${item.codInt}', '${escapedName}', '${item.ean}')" title="Adicionar Imagem">${icon}</div>`;
    }

    return `
        <div class="catalog-card" data-sap="${item.codInt}" data-ean="${item.ean}" data-name="${item.mercadoria.toLowerCase()}">
            <div class="catalog-img-wrapper">${imgHtml}</div>
            <div class="catalog-card-body">
                <div class="catalog-title">${item.mercadoria}</div>
                <div class="catalog-info">
                    <div class="catalog-info-item">
                        <span class="catalog-info-label">SAP</span>
                        <span class="catalog-info-value">${item.codInt}</span>
                    </div>
                    <div class="catalog-info-item">
                        <span class="catalog-info-label">EAN</span>
                        <span class="catalog-info-value ean">${eanText}</span>
                    </div>
                    <div class="catalog-info-item">
                        <span class="catalog-info-label">Ref</span>
                        <span class="catalog-info-value">${item.fornecedorCod}</span>
                    </div>
                </div>
                <div class="catalog-card-actions">
                    <button class="btn-card-edit" onclick="openProductModal('${item.codInt}')">✏️ Editar</button>
                    <button class="btn-card-delete" onclick="deleteProduct('${item.codInt}')">🗑️ Excluir</button>
                </div>
            </div>
        </div>
    `;
}

// Expor openProductModal globalmente
window.openProductModal = openProductModal;

function renderCatalog() {
    const grid       = document.getElementById('catalog-grid');
    const emptyState = document.getElementById('catalog-empty-state');
    const searchInput = document.getElementById('search-input');

    if (searchInput) searchInput.value = '';
    if (!grid) return;

    if (products.length === 0) {
        grid.innerHTML = '';
        if (emptyState) {
            emptyState.classList.remove('hidden');
            emptyState.innerHTML = `
                <div style="font-size:3rem;margin-bottom:12px;">📦</div>
                <p style="font-size:1.1rem;font-weight:600;color:#555;margin-bottom:8px;">Seu catálogo está vazio</p>
                <p style="color:#999;margin-bottom:20px;">Clique em <strong>＋ Adicionar Produto</strong> para começar.</p>
            `;
        }
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');
    grid.innerHTML = products.map(renderCatalogCard).join('');
}

// ─── Busca ────────────────────────────────────────────────────────────
const searchInput = document.getElementById('search-input');
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const cards = document.querySelectorAll('.catalog-card');
        let visible = 0;
        const emptyState = document.getElementById('catalog-empty-state');

        cards.forEach(card => {
            const match = (card.getAttribute('data-sap') || '').includes(query)
                       || (card.getAttribute('data-ean') || '').includes(query)
                       || (card.getAttribute('data-name') || '').includes(query);
            card.style.display = match ? 'flex' : 'none';
            if (match) visible++;
        });

        if (visible === 0 && cards.length > 0 && emptyState) {
            emptyState.classList.remove('hidden');
            emptyState.textContent = `Nenhum produto encontrado para "${query}".`;
        } else if (emptyState) {
            emptyState.classList.add('hidden');
        }
    });
}

// ─── Impressão ────────────────────────────────────────────────────────
window.generatePrintReport = function() {
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const imgThumb = (codInt) => {
        const img = getProductImage(codInt);
        return img
            ? `<img src="${img}" style="width:100%;height:150px;object-fit:contain;background:white;border-bottom:1px solid #eee;" />`
            : `<div style="height:150px;display:flex;align-items:center;justify-content:center;font-size:3rem;background:#f5f5f5;">📦</div>`;
    };

    let contentHtml = '<div class="grid-container">';
    products.forEach(item => {
        contentHtml += `
            <div class="card">
                ${imgThumb(item.codInt)}
                <div class="card-body">
                    <div class="card-title">${item.mercadoria}</div>
                    <div class="card-meta">
                        <div><strong>SAP:</strong> ${item.codInt}</div>
                        <div><strong>EAN:</strong> ${item.ean && item.ean !== 'N/A' ? item.ean : 'Sem EAN'}</div>
                        <div><strong>Ref:</strong> ${item.fornecedorCod}</div>
                    </div>
                </div>
            </div>
        `;
    });
    contentHtml += '</div>';

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>Catálogo de Produtos</title>
<style>
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: sans-serif; color: #333; padding: 20px; }
  @page { size: A4 portrait; margin: 1cm; }
  @media print { .no-print { display: none !important; } body { padding: 0; margin: 0; } }
  .header { display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #ccc; padding-bottom:10px; margin-bottom:20px; }
  .header h1 { margin:0; font-size:1.5rem; color:#4b5563; }
  .grid-container { display:grid; grid-template-columns:repeat(4,1fr); gap:15px; }
  .card { border:1px solid #e5e7eb; border-radius:8px; overflow:hidden; page-break-inside:avoid; }
  .card-body { padding:10px; }
  .card-title { font-size:0.9rem; font-weight:bold; margin-bottom:8px; line-height:1.2; height:3.6em; overflow:hidden; }
  .card-meta { font-size:0.75rem; color:#666; }
  .card-meta div { margin-bottom:3px; }
  .btn-group { display:flex; justify-content:center; gap:10px; margin-bottom:20px; }
  .print-btn { padding:10px 20px; background:#2575fc; color:white; border:none; border-radius:5px; cursor:pointer; font-size:1rem; font-weight:bold; }
</style>
</head>
<body>
<div class="btn-group no-print">
  <button class="print-btn" onclick="window.print()">🖨️ Salvar PDF / Imprimir Catálogo</button>
</div>
<div class="header">
  <div><h1>📋 Catálogo de Produtos</h1></div>
  <div style="text-align:right;font-size:0.85rem;color:#666;"><strong>${dateStr}</strong><br>Gerado às ${timeStr}<br>Total: ${products.length} itens</div>
</div>
${contentHtml}
</body>
</html>`;

    const win = window.open('', '_blank');
    if (win) {
        win.document.write(html);
        win.document.close();
        win.onload = () => setTimeout(() => win.print(), 500);
    } else {
        alert('O bloqueador de pop-ups impediu a geração do catálogo. Por favor, permita pop-ups para este site.');
    }
};

// ─── Importação de Planilha Excel (SheetJS) e Scraping Automático ─────
const btnImportExcel = document.getElementById('btn-import-excel');
const inputImportExcel = document.getElementById('import-excel-input');

if (btnImportExcel && inputImportExcel) {
    btnImportExcel.addEventListener('click', () => {
        inputImportExcel.click();
    });

    inputImportExcel.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const data = evt.target.result;
                const workbook = window.XLSX.read(data, { type: 'binary' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const rows = window.XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                if (rows.length === 0) {
                    alert('A planilha está vazia.');
                    return;
                }

                // Detecta qual coluna tem qual informação pela primeira linha (header)
                const headers = rows[0].map(h => typeof h === 'string' ? h.toUpperCase().trim() : '');
                
                let idxCod = headers.findIndex(h => h.includes('COD') || h.includes('SAP') || h.includes('PRODUTO'));
                let idxName = headers.findIndex(h => h.includes('DESC') || h.includes('MERCADORIA') || h.includes('NOME'));
                let idxEan = headers.findIndex(h => h.includes('EAN') || h.includes('BARRAS'));
                let idxFornecedor = headers.findIndex(h => h.includes('FORN'));
                
                // Defaults if not clearly identified
                if (idxCod === -1) idxCod = 0;
                if (idxName === -1) idxName = 1;

                let importedCount = 0;
                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i];
                    if (!row || row.length === 0) continue;

                    let codRaw = row[idxCod];
                    if (codRaw === undefined || codRaw === null || String(codRaw).trim() === '') continue;

                    const codInt = String(codRaw).trim();
                    const mercadoria = String(row[idxName] || 'Produto sem nome').trim();
                    const ean = idxEan !== -1 ? String(row[idxEan] || 'N/A').trim() : 'N/A';
                    const fornecedorCod = idxFornecedor !== -1 ? String(row[idxFornecedor] || '-').trim() : '-';

                    // Evita duplicatas pelo codInt
                    if (!products.some(p => p.codInt === codInt)) {
                        products.push({
                            codInt,
                            mercadoria,
                            ean,
                            fornecedorCod,
                            fornecedor: 'IMPORTADO',
                            precoAnterior: 0,
                            novoPreco: 0,
                            estoque: '0'
                        });
                        importedCount++;
                    }
                }

                saveProducts(products);
                renderCatalog();
                alert(`${importedCount} novos produtos importados com sucesso! Buscando imagens...`);
                
                // Inicia o auto-scraper para preencher imagens faltantes
                runAutoScraperInBackground();

            } catch (err) {
                console.error(err);
                alert('Erro ao ler o arquivo Excel. Verifique o formato.');
            } finally {
                inputImportExcel.value = '';
            }
        };
        reader.readAsBinaryString(file);
    });
}

window.cancelScraper = false;
async function runAutoScraperInBackground() {
    const itemsToScrape = products.filter(item => {
        const hasId = (item.ean && item.ean !== 'N/A' && item.ean !== '-') || 
                      (item.fornecedorCod && item.fornecedorCod !== 'N/A' && item.fornecedorCod !== '-') ||
                      item.codInt;
        return hasId && !getProductImage(item.codInt);
    });

    if (itemsToScrape.length === 0) return;
    
    window.cancelScraper = false;
    const total = itemsToScrape.length;
    let current = 0;
    let scrapeStartTime = Date.now();

    const overlay = document.getElementById('scraper-overlay');
    const textProgress = document.getElementById('scraper-progress-text');
    const barProgress = document.getElementById('scraper-progress-fill');
    const textTime = document.getElementById('scraper-time-estimate');
    const btnCancel = document.getElementById('btn-scraper-cancel');

    const updateProgress = (cur) => {
        if (textProgress) textProgress.textContent = `${cur} / ${total}`;
        if (barProgress) barProgress.style.width = `${(cur / total) * 100}%`;
    };

    let timerInterval;
    if (overlay) {
        updateProgress(0);
        overlay.classList.remove('hidden');
        
        timerInterval = setInterval(() => {
            let remainingSecs = 0;
            if (current > 0) {
                const elapsedSecs = (Date.now() - scrapeStartTime) / 1000;
                const avgSecs = elapsedSecs / current;
                remainingSecs = Math.ceil(avgSecs * (total - current));
            } else {
                remainingSecs = Math.ceil(total * 1.5);
            }
            const mins = Math.floor(remainingSecs / 60);
            const secs = remainingSecs % 60;
            if (textTime) textTime.textContent = mins > 0 ? `${mins} min e ${secs} seg` : `${secs} segundos`;
        }, 1000);
        
        btnCancel.onclick = () => {
            window.cancelScraper = true;
            btnCancel.textContent = "Interrompendo... por favor aguarde um momento.";
            btnCancel.disabled = true;
            btnCancel.style.background = "#9ca3af";
            clearInterval(timerInterval);
        };
    }

    for (const item of itemsToScrape) {
        if (window.cancelScraper) break;
        if (getProductImage(item.codInt)) {
            current++;
            updateProgress(current);
            continue;
        }

        const queryId = (item.ean && item.ean !== 'N/A' && item.ean !== '-') ? item.ean : item.codInt;

        try {
            const result = await scrapeImageFromPBKids(queryId);
            if (result && result.imageUrl) {
                saveProductImage(item.codInt, result.imageUrl, item.mercadoria);
                if (result.ean && (!item.ean || item.ean === 'N/A' || item.ean === '-')) {
                    item.ean = result.ean;
                    saveProducts(products); // Salva EAN descoberto se não tinha
                }
            }
        } catch(e) {
            // Tenta fallback com codInt se a primeira falhou e era EAN
            if (queryId !== item.codInt) {
                try {
                    const fallback = await scrapeImageFromPBKids(item.codInt);
                    if (fallback && fallback.imageUrl) saveProductImage(item.codInt, fallback.imageUrl, item.mercadoria);
                } catch(err) {}
            }
        }
        
        current++;
        updateProgress(current);
        await new Promise(r => setTimeout(r, 400));
    }

    if (timerInterval) clearInterval(timerInterval);
    renderCatalog();

    if (overlay) {
        overlay.classList.add('hidden');
        btnCancel.textContent = "PULAR ISSO E VER O CATÁLOGO AGORA";
        btnCancel.disabled = false;
        btnCancel.style.background = "#ef4444";
    }
}

// ─── Inicialização ────────────────────────────────────────────────────
resultsContainer.classList.remove('hidden');
const dropZone = document.getElementById('drop-zone');
if (dropZone) dropZone.style.display = 'none';

async function autoLoadCampaignDatabase() {
    try {
        const filename = encodeURIComponent('MAIS DIVERSÃO POR MENOS - CAMPANHA AGING.xlsx');
        const response = await fetch('./' + filename);
        if (!response.ok) {
            console.log('Campanha AGING não encontrada ou erro no fetch.');
            return;
        }
        const arrayBuffer = await response.arrayBuffer();
        const data = new Uint8Array(arrayBuffer);
        const workbook = window.XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rows = window.XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (rows.length === 0) return;

        const headers = rows[0].map(h => typeof h === 'string' ? h.toUpperCase().trim() : '');
        let idxCod = headers.findIndex(h => h.includes('COD') || h.includes('SAP') || h.includes('PRODUTO'));
        let idxName = headers.findIndex(h => h.includes('DESC') || h.includes('MERCADORIA') || h.includes('NOME'));
        let idxFornecedor = headers.findIndex(h => h.includes('FORN'));
        
        if (idxCod === -1) idxCod = 0;
        if (idxName === -1) idxName = 1;

        let importedCount = 0;
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;

            let codRaw = row[idxCod];
            if (codRaw === undefined || codRaw === null || String(codRaw).trim() === '') continue;

            const codInt = String(codRaw).trim();
            const mercadoria = String(row[idxName] || 'Produto sem nome').trim();
            const fornecedorStr = idxFornecedor !== -1 ? String(row[idxFornecedor] || '-').trim() : '-';

            if (!products.some(p => p.codInt === codInt)) {
                products.push({
                    codInt,
                    mercadoria,
                    ean: 'N/A',
                    fornecedorCod: '-',
                    fornecedor: fornecedorStr,
                    precoAnterior: 0,
                    novoPreco: 0,
                    estoque: '0'
                });
                importedCount++;
            }
        }

        if (importedCount > 0) {
            saveProducts(products);
            renderCatalog();
            console.log(`${importedCount} novos produtos carregados da campanha!`);
            runAutoScraperInBackground();
        }
    } catch (err) {
        console.error('Erro ao auto-carregar campanha:', err);
    }
}

// Inicia banco de dados online e depois carrega a interface
async function bootstrap() {
    await initOnlineDatabase();
    renderCatalog();
    autoLoadCampaignDatabase();
}

bootstrap();

