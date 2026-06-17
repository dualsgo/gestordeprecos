import { processFile } from './parser.js';
import { getProductImage, saveProductImage, deleteProductImage, getCategoryIcon, scrapeImageFromRiHappy, getDatabase, saveDatabase } from './store.js';

const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const resultsContainer = document.getElementById('results');
const btnPrint = document.getElementById('btn-print');
const btnNew = document.getElementById('btn-new');
const dropText = document.getElementById('drop-text');

// Tempo
const statBox = document.getElementById('operation-stats');
const statStart = document.getElementById('stat-start-time');
const statEnd = document.getElementById('stat-end-time');
const statDuration = document.getElementById('stat-duration');

// Modal Imagem
const modal = document.getElementById('image-modal');
const btnModalCancel = document.getElementById('btn-modal-cancel');
const btnModalSave = document.getElementById('btn-modal-save');
const imgUrlInput = document.getElementById('img-url-input');
const searchHelperLinks = document.getElementById('search-helper-links');

let currentGlobalData = null;
let currentAddingImageCode = null;
let currentAddingImageName = null;
let currentAddingImageEan = null;
window.isScraping = false;
let startTime = null;

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
        handleFile(e.dataTransfer.files[0]);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
        handleFile(e.target.files[0]);
    }
});

btnPrint.addEventListener('click', () => {
    if (window.generatePrintReport) window.generatePrintReport();
});

btnNew.addEventListener('click', () => {
    resultsContainer.classList.add('hidden');
    dropZone.style.display = 'block';
    statBox.classList.add('hidden');
    fileInput.value = '';
    dropText.textContent = "Aguardando arquivo...";
    startTime = null;
});

// Modal Logic
window.openImageModal = function(codInt, productName, ean) {
    currentAddingImageCode = codInt;
    currentAddingImageName = productName;
    currentAddingImageEan = ean;
    imgUrlInput.value = '';
    
    const statusDiv = document.getElementById('modal-scrape-status');
    if (statusDiv) statusDiv.textContent = '';
    
    const query = encodeURIComponent(productName);
    const googleLink = `<a href="https://www.google.com/search?tbm=isch&q=${query}" target="_blank">🔍 Buscar no Google Imagens</a>`;
    
    const rihappyQuery = (ean && ean !== 'N/A' && ean !== '-') ? ean : codInt;
    const rihappyLink = `<a href="https://www.rihappy.com.br/${rihappyQuery}/rihappy?map=ft,vendido-por" target="_blank">🧸 Buscar na RiHappy</a>`;

    searchHelperLinks.innerHTML = `${googleLink} ${rihappyLink}`;
    
    const btnDelete = document.getElementById('btn-modal-delete');
    if (getProductImage(codInt)) {
        btnDelete.style.display = 'block';
    } else {
        btnDelete.style.display = 'none';
    }
    
    modal.classList.remove('hidden');
};

function closeImageModal() {
    modal.classList.add('hidden');
}

// Lightbox
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

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.closeLightbox();
});

btnModalCancel.addEventListener('click', () => {
    modal.classList.add('hidden');
});

btnModalSave.addEventListener('click', () => {
    const url = imgUrlInput.value.trim();
    if (url && currentAddingImageCode) {
        saveProductImage(currentAddingImageCode, url, currentAddingImageName);
        if (currentGlobalData) renderResults(currentGlobalData);
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
        
        const queryId = (currentAddingImageEan && currentAddingImageEan !== 'N/A' && currentAddingImageEan !== '-') ? currentAddingImageEan : currentAddingImageCode;
        
        const imageUrl = await scrapeImageFromRiHappy(queryId);
        if (imageUrl) {
            statusDiv.textContent = '✅ Imagem encontrada!';
            statusDiv.style.color = '#10b981';
            imgUrlInput.value = imageUrl;
            saveProductImage(currentAddingImageCode, imageUrl, currentAddingImageName);
            if (currentGlobalData) renderResults(currentGlobalData);
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
            if (currentGlobalData) renderResults(currentGlobalData);
        }
        closeImageModal();
    });
}


function formatMoney(value) {
    return 'R$ ' + value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getDiffBadge(oldPrice, newPrice, isRebaixa = false) {
    if (oldPrice <= 0) return '';
    const diffPercent = (((newPrice - oldPrice) / oldPrice) * 100).toFixed(1);
    
    if (newPrice > oldPrice) {
        return `<span class="diff-badge diff-up">↑ ${diffPercent.replace('.', ',')}%</span>`;
    } else if (newPrice < oldPrice) {
        return `<span class="diff-badge ${isRebaixa ? 'diff-info' : 'diff-down'}">↓ ${Math.abs(diffPercent).toString().replace('.', ',')}%</span>`;
    }
    return '';
}

async function handleFile(file) {
    dropText.innerHTML = '<div class="loader-inline"><div class="spinner"></div> Processando seu relatório, aguarde...</div>';
    try {
        const data = await processFile(file);
        currentGlobalData = data;
        
        startTime = new Date();
        statStart.textContent = startTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute:'2-digit' });
        statEnd.textContent = '--:--';
        statDuration.textContent = '-- min';
        statBox.classList.remove('hidden');

        renderResults(data);
        resultsContainer.classList.remove('hidden');
        dropZone.style.display = 'none';
        
        runAutoScraperInBackground(data);

    } catch (error) {
        console.error(error);
        alert("Ocorreu um erro ao ler o arquivo. Tem certeza de que é o relatório correto?");
        dropText.textContent = "Aguardando arquivo...";
    }
}

function groupItemsByFornecedor(items) {
    const grouped = {};
    items.forEach(item => {
        if (!grouped[item.fornecedor]) {
            grouped[item.fornecedor] = [];
        }
        grouped[item.fornecedor].push(item);
    });
    return grouped;
}

function getImageHtml(item) {
    const savedImg = getProductImage(item.codInt);
    const escapedName = item.mercadoria.replace(/'/g, "\\'");
    if (savedImg) {
        return `
          <div class="img-wrap">
            <img src="${savedImg}" class="product-thumb"
              onclick="openLightbox('${savedImg}', '${escapedName}')"
              title="Ver imagem" />
            <button class="edit-img-btn"
              onclick="event.stopPropagation(); openImageModal('${item.codInt}', '${escapedName}', '${item.ean}')"
              title="Trocar imagem">\u270E</button>
          </div>`;
    } else {
        const icon = getCategoryIcon(item.mercadoria);
        return `<div class="no-image" onclick="openImageModal('${item.codInt}', '${escapedName}', '${item.ean}')" title="Adicionar Imagem">${icon}</div>`;
    }
}

function renderCatalogCard(item) {
    const savedImg = getProductImage(item.codInt);
    const escapedName = item.mercadoria.replace(/'/g, "\\'");
    let imgHtml = '';
    if (savedImg) {
        imgHtml = `<img src="${savedImg}" onclick="openLightbox('${savedImg}', '${escapedName}')" title="Ver imagem" />
                   <button class="catalog-edit-img-btn" onclick="event.stopPropagation(); openImageModal('${item.codInt}', '${escapedName}', '${item.ean}')" title="Trocar imagem">\u270E</button>`;
    } else {
        const icon = getCategoryIcon(item.mercadoria);
        imgHtml = `<div class="catalog-no-image" onclick="openImageModal('${item.codInt}', '${escapedName}', '${item.ean}')" title="Adicionar Imagem">${icon}</div>`;
    }

    const eanText = (item.ean && item.ean !== 'N/A' && item.ean !== '-') ? item.ean : 'Sem EAN';

    return `
        <div class="catalog-card" data-sap="${item.codInt}" data-ean="${item.ean}" data-name="${item.mercadoria.toLowerCase()}">
            <div class="catalog-img-wrapper">
                ${imgHtml}
            </div>
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
            </div>
        </div>
    `;
}

function renderResults(data) {
    const grid = document.getElementById('catalog-grid');
    const emptyState = document.getElementById('catalog-empty-state');
    const searchInput = document.getElementById('search-input');
    
    if (searchInput) {
        searchInput.value = ''; // Reseta a busca ao carregar novo relatório
    }
    
    if (!grid) return;
    grid.innerHTML = '';
    
    let allItems = [];
    if (data.aumentos) allItems = allItems.concat(data.aumentos);
    if (data.entradasOferta) allItems = allItems.concat(data.entradasOferta);
    if (data.rebaixas) allItems = allItems.concat(data.rebaixas);
    if (data.terminosOferta) allItems = allItems.concat(data.terminosOferta);
    if (data.semGiro) allItems = allItems.concat(data.semGiro);
    
    const uniqueItems = [];
    const seen = new Set();
    allItems.forEach(item => {
        if (!seen.has(item.codInt)) {
            seen.add(item.codInt);
            uniqueItems.push(item);
        }
    });

    if (uniqueItems.length === 0) {
        emptyState.classList.remove('hidden');
        emptyState.textContent = 'Nenhum produto encontrado no relatório.';
        return;
    }

    emptyState.classList.add('hidden');
    let html = '';
    uniqueItems.forEach(item => {
        html += renderCatalogCard(item);
    });
    grid.innerHTML = html;
}

const searchInput = document.getElementById('search-input');
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const cards = document.querySelectorAll('.catalog-card');
        let visibleCount = 0;
        const emptyState = document.getElementById('catalog-empty-state');
        
        cards.forEach(card => {
            const sap = card.getAttribute('data-sap') || '';
            const ean = card.getAttribute('data-ean') || '';
            const name = card.getAttribute('data-name') || '';
            
            if (sap.includes(query) || ean.includes(query) || name.includes(query)) {
                card.style.display = 'flex';
                visibleCount++;
            } else {
                card.style.display = 'none';
            }
        });

        if (visibleCount === 0 && cards.length > 0) {
            if (emptyState) {
                emptyState.classList.remove('hidden');
                emptyState.textContent = 'Nenhum produto encontrado para "' + query + '".';
            }
        } else {
            if (emptyState) emptyState.classList.add('hidden');
        }
    });
}

window.cancelScraper = false;

async function runAutoScraperInBackground(data) {
    let allItems = [];
    if (data.aumentos) allItems = allItems.concat(data.aumentos);
    if (data.entradasOferta) allItems = allItems.concat(data.entradasOferta);
    if (data.rebaixas) allItems = allItems.concat(data.rebaixas);
    if (data.terminosOferta) allItems = allItems.concat(data.terminosOferta);
    if (data.semGiro) allItems = allItems.concat(data.semGiro);

    const itemsToScrape = allItems.filter(item => {
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
    
    window.isScraping = true;

    for (const item of itemsToScrape) {
        if (window.cancelScraper) {
            console.log("Scraping interrompido pelo usuário.");
            break;
        }

        if (getProductImage(item.codInt)) {
            current++;
            updateProgress(current);
            continue;
        }

        const queryId = (item.ean && item.ean !== 'N/A' && item.ean !== '-') ? item.ean : item.codInt;

        const result = await scrapeImageFromRiHappy(queryId);
        if (result && result.imageUrl) {
            console.log(`✨ Imagem resgatada com sucesso para: ${item.mercadoria}`);
            saveProductImage(item.codInt, result.imageUrl, item.mercadoria);
            
            if (result.ean && (!item.ean || item.ean === 'N/A' || item.ean === '-')) {
                item.ean = result.ean;
            }
        }
        
        current++;
        updateProgress(current);
        await new Promise(r => setTimeout(r, 300));
    }

    if (timerInterval) clearInterval(timerInterval);

    if (currentGlobalData) renderResults(currentGlobalData);

    if (overlay) {
        overlay.classList.add('hidden');
        btnCancel.textContent = "PULAR ISSO E VER O RELATÓRIO AGORA";
        btnCancel.disabled = false;
        btnCancel.style.background = "#ef4444";
    }
    window.isScraping = false;
}

window.generatePrintReport = function() {
    if (!currentGlobalData) return;

    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    let allItems = [];
    if (currentGlobalData.aumentos) allItems = allItems.concat(currentGlobalData.aumentos);
    if (currentGlobalData.entradasOferta) allItems = allItems.concat(currentGlobalData.entradasOferta);
    if (currentGlobalData.rebaixas) allItems = allItems.concat(currentGlobalData.rebaixas);
    if (currentGlobalData.terminosOferta) allItems = allItems.concat(currentGlobalData.terminosOferta);
    if (currentGlobalData.semGiro) allItems = allItems.concat(currentGlobalData.semGiro);

    const uniqueItems = [];
    const seen = new Set();
    allItems.forEach(item => {
        if (!seen.has(item.codInt)) {
            seen.add(item.codInt);
            uniqueItems.push(item);
        }
    });

    const imgThumb = (codInt) => {
        const img = getProductImage(codInt);
        return img ? `<img src="${img}" style="width:100%;height:150px;object-fit:contain;background:white;border-bottom:1px solid #eee;" />` : '<div style="height:150px; display:flex; align-items:center; justify-content:center; font-size:3rem; background:#f5f5f5;">📦</div>';
    };

    let title = 'Catálogo de Produtos';
    let contentHtml = '<div class="grid-container">';

    uniqueItems.forEach(item => {
        contentHtml += `
            <div class="card">
                ${imgThumb(item.codInt)}
                <div class="card-body">
                    <div class="card-title">${item.mercadoria}</div>
                    <div class="card-meta">
                        <div><strong>SAP:</strong> ${item.codInt}</div>
                        <div><strong>EAN:</strong> ${item.ean && item.ean !== 'N/A' && item.ean !== '-' ? item.ean : 'Sem EAN'}</div>
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
<title>${title}</title>
<style>
  html, body { height: 100%; margin: 0; padding: 0; background: #fff; }
  body { font-family: sans-serif; color: #333; padding: 20px; }
  @page { size: A4 portrait; margin: 1cm; }
  @media print { 
    .no-print { display: none !important; } 
    body { padding: 0; margin: 0; } 
  }
  .header { display:flex; justify-content:space-between; align-items: center; border-bottom: 2px solid #ccc; padding-bottom: 10px; margin-bottom: 20px; }
  .header h1 { margin:0; font-size: 1.5rem; color: #4b5563; }
  .grid-container { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; }
  .card { border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; page-break-inside: avoid; }
  .card-body { padding: 10px; }
  .card-title { font-size: 0.9rem; font-weight: bold; margin-bottom: 8px; line-height: 1.2; height: 3.6em; overflow: hidden; }
  .card-meta { font-size: 0.75rem; color: #666; }
  .card-meta div { margin-bottom: 3px; }
  .btn-group { display: flex; justify-content: center; gap: 10px; margin-bottom: 20px; }
  .print-btn { padding: 10px 20px; background: #2575fc; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 1rem; font-weight: bold; }
</style>
</head>
<body>
<div class="btn-group no-print">
  <button class="print-btn" onclick="window.print()">🖨️ Salvar PDF / Imprimir Catálogo</button>
</div>
<div class="header">
  <div><h1>📋 ${title}</h1></div>
  <div style="text-align:right; font-size: 0.85rem; color: #666;"><strong>${dateStr}</strong><br>Gerado às ${timeStr}<br>Total: ${uniqueItems.length} itens</div>
</div>
${contentHtml}
</body>
</html>`;

    const win = window.open('', '_blank');
    if (win) {
        win.document.write(html);
        win.document.close();
        win.onload = function() {
            setTimeout(() => { win.print(); }, 500);
        };
    } else {
        alert("O bloqueador de pop-ups impediu a geração do catálogo. Por favor, permita pop-ups para este site.");
    }
}
