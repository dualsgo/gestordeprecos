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
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

function populateTableGrouped(tableId, items, colsCallback, colorVar) {
    const tbody = document.querySelector(`#${tableId} tbody`);
    tbody.innerHTML = '';
    const theadTr = document.querySelector(`#${tableId} thead tr`);
    const colspan = theadTr ? theadTr.children.length : 8;
    
    const sectionId = tableId.replace('table-', 'card-');
    const section = document.getElementById(sectionId);

    if (items.length === 0) {
        if (section) section.style.display = 'none';
        return;
    } else {
        if (section) section.style.display = 'block';
    }

    const grouped = groupItemsByFornecedor(items);

    for (const [fornecedor, groupedItems] of Object.entries(grouped)) {
        if (fornecedor !== 'SEM_FORNECEDOR') {
            const headerTr = document.createElement('tr');
            headerTr.innerHTML = `<td colspan="${colspan}" class="supplier-row">
                <strong>${fornecedor.startsWith('Fornecedor') ? fornecedor : 'Fornecedor: ' + fornecedor}</strong>
            </td>`;
            tbody.appendChild(headerTr);
        }

        groupedItems.sort((a, b) => {
            const getDiff = (item) => {
                if (item.promocao > 0) {
                    const basePrice = item.precoAnterior > 0 ? item.precoAnterior : item.novoPreco;
                    return Math.abs(basePrice - item.promocao);
                }
                return Math.abs(item.novoPreco - item.precoAnterior);
            };
            return getDiff(b) - getDiff(a);
        });

        groupedItems.forEach(item => {
            const tr = document.createElement('tr');
            const eanText = (item.ean && item.ean !== 'N/A') ? item.ean : '-';
            const imgHtml = getImageHtml(item);

            tr.innerHTML = `
                <td>${imgHtml}</td>
                <td>${item.codInt}</td>
                <td style="color: #607d8b; font-size: 0.9rem;">${eanText}</td>
                <td><strong>${item.mercadoria}</strong></td>
                <td>${item.fornecedorCod}</td>
                <td><strong>${item.estoque}</strong></td>
                ${colsCallback(item)}
            `;
            tbody.appendChild(tr);
        });
    }
}

function renderResults(data) {
    populateTableGrouped('table-aumentos', data.aumentos, (item) => `
        <td class="price">${formatMoney(item.precoAnterior)}</td>
        <td class="price" style="color: var(--danger-color);">${formatMoney(item.novoPreco)} ${getDiffBadge(item.precoAnterior, item.novoPreco, false)}</td>
    `, 'var(--danger-color)');

    populateTableGrouped('table-ofertas', data.entradasOferta, (item) => {
        const basePrice = item.precoAnterior > 0 ? item.precoAnterior : item.novoPreco;
        return `
        <td class="price">${formatMoney(basePrice)}</td>
        <td class="price" style="color: var(--success-color);">${formatMoney(item.promocao)} ${getDiffBadge(basePrice, item.promocao, false)}</td>
        `;
    }, 'var(--success-color)');

    populateTableGrouped('table-rebaixas', data.rebaixas, (item) => `
        <td class="price">${formatMoney(item.precoAnterior)}</td>
        <td class="price" style="color: var(--info-color);">${formatMoney(item.novoPreco)} ${getDiffBadge(item.precoAnterior, item.novoPreco, true)}</td>
    `, 'var(--info-color)');

    populateTableGrouped('table-terminos', data.terminosOferta, (item) => `
        <td class="price">${formatMoney(item.precoAnterior)}</td>
        <td class="price" style="color: var(--warning-color);">${formatMoney(item.novoPreco)} ${getDiffBadge(item.precoAnterior, item.novoPreco, false)}</td>
    `, 'var(--warning-color)');
}

async function runAutoScraperInBackground(data) {
    let allItems = [];
    if (data.aumentos) allItems = allItems.concat(data.aumentos);
    if (data.entradasOferta) allItems = allItems.concat(data.entradasOferta);
    if (data.rebaixas) allItems = allItems.concat(data.rebaixas);
    if (data.terminosOferta) allItems = allItems.concat(data.terminosOferta);

    const itemsToScrape = allItems.filter(item => {
        const hasId = (item.ean && item.ean !== 'N/A' && item.ean !== '-') || 
                      (item.fornecedorCod && item.fornecedorCod !== 'N/A' && item.fornecedorCod !== '-') ||
                      item.codInt;
        return hasId && !getProductImage(item.codInt);
    });

    if (itemsToScrape.length === 0) return;
    console.log(`🤖 Iniciando auto-scrape para ${itemsToScrape.length} produtos sem foto...`);

    const scraperIndicator = document.getElementById('scraper-indicator');
    const scraperText = document.getElementById('scraper-text');
    if(scraperIndicator) scraperIndicator.classList.add('visible');
    
    window.isScraping = true;

    for (const item of itemsToScrape) {
        if (getProductImage(item.codInt)) continue;

        if(scraperText) scraperText.textContent = `Buscando foto: ${item.mercadoria.substring(0, 15)}...`;

        const queryId = (item.ean && item.ean !== 'N/A' && item.ean !== '-') ? item.ean : item.codInt;

        const imageUrl = await scrapeImageFromRiHappy(queryId);
        if (imageUrl) {
            console.log(`✨ Imagem resgatada com sucesso para: ${item.mercadoria}`);
            saveProductImage(item.codInt, imageUrl, item.mercadoria);
            
            if (currentGlobalData) renderResults(currentGlobalData);
        }
        
        await new Promise(r => setTimeout(r, 1000));
    }

    if(scraperIndicator) scraperIndicator.classList.remove('visible');
    window.isScraping = false;
}

window.generatePrintReport = function() {
    if (!currentGlobalData) return;

    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    function fmtMoney(v) { return v > 0 ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'; }

    const imgThumb = (codInt) => {
        const img = getProductImage(codInt);
        return img ? `<img src="${img}" style="width:36px;height:36px;object-fit:cover;border-radius:6px;border:1px solid #eee;" />` : '<span style="font-size:1.4rem;">📦</span>';
    };

    let title = 'Relatório de Alteração de Preços';
    let contentHtml = '';
    let summaryHtml = '';

    const totalItens = (currentGlobalData.aumentos?.length || 0) + (currentGlobalData.entradasOferta?.length || 0) + 
                       (currentGlobalData.rebaixas?.length || 0) + (currentGlobalData.terminosOferta?.length || 0);

    summaryHtml = `
    <div class="summary-bar">
      <div class="summary-box danger"><div class="count">${currentGlobalData.aumentos?.length || 0}</div><div class="label">Aumentos</div></div>
      <div class="summary-box success"><div class="count">${currentGlobalData.entradasOferta?.length || 0}</div><div class="label">Entradas de Oferta</div></div>
      <div class="summary-box info"><div class="count">${currentGlobalData.rebaixas?.length || 0}</div><div class="label">Rebaixas</div></div>
      <div class="summary-box warning"><div class="count">${currentGlobalData.terminosOferta?.length || 0}</div><div class="label">Términos de Oferta</div></div>
      <div class="summary-box"><div class="count">${totalItens}</div><div class="label">Total de Itens</div></div>
    </div>`;

    const buildSection = (secTitle, color, items, renderRow) => {
        if (!items || !items.length) return '';
        return `
        <div class="section-container" style="margin-bottom:28px; page-break-inside:avoid;">
            <div style="background:${color}; color:white; padding:8px 12px; font-weight:bold; border-radius:6px 6px 0 0;">${secTitle} (${items.length} itens)</div>
            <table style="width:100%; border-collapse:collapse; font-size:0.8rem;">
                <thead><tr style="background:#f5f5f5; text-align:left;">
                    <th style="padding:6px;">Foto</th><th style="padding:6px;">SAP</th><th style="padding:6px;">Produto</th><th style="padding:6px;">Estoque</th><th style="padding:6px;">Preços</th>
                </tr></thead>
                <tbody>${items.map(item => `
                    <tr style="border-bottom:1px solid #ddd;">
                        <td style="padding:6px;">${imgThumb(item.codInt)}</td>
                        <td style="padding:6px;">${item.codInt}</td>
                        <td style="padding:6px;"><strong>${item.mercadoria}</strong><br><small style="color:#666;">EAN: ${item.ean}</small></td>
                        <td style="padding:6px;">${item.estoque}</td>
                        <td style="padding:6px;">${renderRow(item)}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>`;
    };

    contentHtml += buildSection('🔴 AUMENTOS', '#ef4444', currentGlobalData.aumentos, i => `De ${fmtMoney(i.precoAnterior)} para <strong>${fmtMoney(i.novoPreco)}</strong>`);
    contentHtml += buildSection('🟠 TÉRMINOS DE OFERTA', '#f59e0b', currentGlobalData.terminosOferta, i => `De ${fmtMoney(i.precoAnterior)} para <strong>${fmtMoney(i.novoPreco)}</strong>`);
    contentHtml += buildSection('🟢 ENTRADAS DE OFERTA', '#10b981', currentGlobalData.entradasOferta, i => `Para <strong>${fmtMoney(i.promocao)}</strong>`);
    contentHtml += buildSection('🔵 REBAIXAS', '#3b82f6', currentGlobalData.rebaixas, i => `De ${fmtMoney(i.precoAnterior)} para <strong>${fmtMoney(i.novoPreco)}</strong>`);


    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>${title}</title>
<style>
  html, body { height: 100%; margin: 0; padding: 0; }
  body { font-family: sans-serif; color: #333; padding: 20px; }
  @page { size: A4 portrait; margin: 1cm; }
  @media print { 
    .no-print { display: none !important; } 
    body { padding: 0; margin: 0; } 
    .section-container:last-of-type { margin-bottom: 0 !important; }
  }
  .header { background: linear-gradient(135deg, #6a11cb 0%, #2575fc 100%); color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; display:flex; justify-content:space-between; align-items: center; }
  .header h1 { margin:0; font-size: 1.5rem; }
  .summary-bar { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
  .summary-box { flex: 1; min-width: 120px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; text-align: center; }
  .summary-box .count { font-size: 1.5rem; font-weight: bold; }
  .summary-box .label { font-size: 0.75rem; text-transform: uppercase; color: #666; margin-top: 5px; }
  .danger .count { color: #ef4444; } .success .count { color: #10b981; } .info .count { color: #3b82f6; } .warning .count { color: #f59e0b; }
  .btn-group { display: flex; justify-content: center; gap: 10px; margin-bottom: 20px; }
  .print-btn { padding: 10px 20px; background: #2575fc; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 1rem; font-weight: bold; }
  .wpp-btn { padding: 10px 20px; background: #25D366; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 1rem; font-weight: bold; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
</style>
</head>
<body>
<div class="btn-group no-print">
  <button class="print-btn" onclick="window.print()">🖨️ Salvar PDF / Imprimir</button>
  <button class="wpp-btn" onclick="shareWpp()">💬 Compartilhar Resumo no WhatsApp</button>
</div>
<div class="header">
  <div><h1>📋 ${title}</h1></div>
  <div style="text-align:right;"><strong>${dateStr}</strong><br>Gerado às ${timeStr}</div>
</div>
${summaryHtml}
${contentHtml}

<script>
function shareWpp() {
    const text = "📋 *${title}*\\n\\nGerado às ${timeStr}\\n\\n*Resumo de Preços:*\\n" + 
                 Array.from(document.querySelectorAll('.summary-box')).map(box => {
                     return box.querySelector('.label').innerText + ": " + box.querySelector('.count').innerText;
                 }).join('\\n');
                 
    const url = "https://api.whatsapp.com/send?text=" + encodeURIComponent(text);
    window.open(url, '_blank');
}
</script>
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
        alert("O bloqueador de pop-ups impediu a geração do relatório. Por favor, permita pop-ups para este site.");
    }
}
