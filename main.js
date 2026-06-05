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
            const getImpact = (item) => {
                if (item.promocao > 0) {
                    const basePrice = item.precoAnterior > 0 ? item.precoAnterior : item.novoPreco;
                    return Math.abs(basePrice - item.promocao) * (item.estoque || 1);
                }
                return Math.abs(item.novoPreco - item.precoAnterior) * (item.estoque || 1);
            };
            return getImpact(b) - getImpact(a);
        });

        groupedItems.forEach(item => {
            const tr = document.createElement('tr');
            const eanText = (item.ean && item.ean !== 'N/A' && item.ean !== '-') ? item.ean : 'Sem EAN';
            const imgHtml = getImageHtml(item);

            tr.innerHTML = `
                <td>${imgHtml}</td>
                <td>
                    <div style="font-size: 1.15rem; font-weight: 700; color: #1f2937; margin-bottom: 4px;">${item.mercadoria}</div>
                    <div style="color: #64748b; font-size: 0.85rem; font-weight: 500;">SAP: ${item.codInt} &nbsp;|&nbsp; EAN: <span style="color:#0ea5e9">${eanText}</span> &nbsp;|&nbsp; Ref: ${item.fornecedorCod}</div>
                </td>
                <td style="font-size: 1.25rem; font-weight: 800; color: #334155; text-align: center;">${item.estoque}</td>
                ${colsCallback(item)}
            `;
            tbody.appendChild(tr);
        });
    }
}

function renderResults(data) {
    populateTableGrouped('table-aumentos', data.aumentos, (item) => {
        const diff = item.novoPreco - item.precoAnterior;
        const pct = item.precoAnterior > 0 ? (diff / item.precoAnterior) * 100 : 0;
        return `
        <td class="price" style="font-size: 1.1rem; color: #64748b; text-decoration: line-through;">${formatMoney(item.precoAnterior)}</td>
        <td class="price" style="color: var(--danger-color); font-size: 1.4rem; font-weight: 800;">${formatMoney(item.novoPreco)}</td>
        <td style="color: var(--danger-color); font-weight: bold; font-size: 1.15rem; text-align: right; background: #fef2f2; border-radius: 6px;">+ ${formatMoney(Math.abs(diff))}<br><small style="font-size:0.85rem">(+${pct.toFixed(1)}%)</small></td>
    `;
    }, 'var(--danger-color)');

    populateTableGrouped('table-ofertas', data.entradasOferta, (item) => {
        const basePrice = item.precoAnterior > 0 ? item.precoAnterior : item.novoPreco;
        const diff = basePrice - item.promocao;
        const pct = basePrice > 0 ? (diff / basePrice) * 100 : 0;
        return `
        <td class="price" style="font-size: 1.1rem; color: #64748b; text-decoration: line-through;">${formatMoney(basePrice)}</td>
        <td class="price" style="color: var(--success-color); font-size: 1.4rem; font-weight: 800;">${formatMoney(item.promocao)}</td>
        <td style="color: var(--success-color); font-weight: bold; font-size: 1.15rem; text-align: right; background: #ecfdf5; border-radius: 6px;">- ${formatMoney(Math.abs(diff))}<br><small style="font-size:0.85rem">(-${pct.toFixed(1)}%)</small></td>
        `;
    }, 'var(--success-color)');

    populateTableGrouped('table-rebaixas', data.rebaixas, (item) => {
        const diff = item.precoAnterior - item.novoPreco;
        const pct = item.precoAnterior > 0 ? (diff / item.precoAnterior) * 100 : 0;
        return `
        <td class="price" style="font-size: 1.1rem; color: #64748b; text-decoration: line-through;">${formatMoney(item.precoAnterior)}</td>
        <td class="price" style="color: var(--info-color); font-size: 1.4rem; font-weight: 800;">${formatMoney(item.novoPreco)}</td>
        <td style="color: var(--info-color); font-weight: bold; font-size: 1.15rem; text-align: right; background: #eff6ff; border-radius: 6px;">- ${formatMoney(Math.abs(diff))}<br><small style="font-size:0.85rem">(-${pct.toFixed(1)}%)</small></td>
    `;
    }, 'var(--info-color)');

    populateTableGrouped('table-terminos', data.terminosOferta, (item) => {
        const diff = item.novoPreco - item.precoAnterior;
        const pct = item.precoAnterior > 0 ? (diff / item.precoAnterior) * 100 : 0;
        return `
        <td class="price" style="font-size: 1.1rem; color: #64748b; text-decoration: line-through;">${formatMoney(item.precoAnterior)}</td>
        <td class="price" style="color: var(--warning-color); font-size: 1.4rem; font-weight: 800;">${formatMoney(item.novoPreco)}</td>
        <td style="color: #d97706; font-weight: bold; font-size: 1.15rem; text-align: right; background: #fffbeb; border-radius: 6px;">+ ${formatMoney(Math.abs(diff))}<br><small style="font-size:0.85rem">(+${pct.toFixed(1)}%)</small></td>
    `;
    }, 'var(--warning-color)');

    populateTableGrouped('table-sem-giro', data.semGiro || [], (item) => {
        const hasImg = getProductImage(item.codInt) ? '✅ Com Imagem' : '❌ Sem Imagem';
        const statusColor = getProductImage(item.codInt) ? 'color: var(--success-color);' : 'color: var(--danger-color);';
        return `
        <td class="price" style="font-size: 1.1rem; color: #64748b;">${formatMoney(item.precoAnterior)}</td>
        <td class="price" style="font-size: 1.1rem; color: #64748b;">${formatMoney(item.promocao)}</td>
        <td style="${statusColor} font-weight: bold; font-size: 1.1rem; text-align: center;">${hasImg}</td>
    `;
    }, '#4b5563');
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
        
        await new Promise(r => setTimeout(r, 1000));
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

    function fmtMoney(v) { return v > 0 ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'; }

    const imgThumb = (codInt) => {
        const img = getProductImage(codInt);
        return img ? `<img src="${img}" style="width:64px;height:64px;object-fit:contain;background:white;border-radius:6px;border:1px solid #eee;" />` : '<span style="font-size:1.8rem;">📦</span>';
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

    const buildSection = (secTitle, color, items, renderRow, colLabels) => {
        if (!items || !items.length) return '';
        const [colAntigo, colNovo, colVar] = colLabels;
        return `
        <div class="section-container" style="page-break-inside:avoid; border-bottom: 2px dashed #ccc;">
            <div style="background:${color}; color:white; padding:6px 12px; font-weight:bold;">${secTitle} (${items.length} itens)</div>
            <table style="width:100%; border-collapse:collapse; font-size:0.95rem;">
                <thead><tr style="background:#f5f5f5; text-align:left;">
                    <th style="padding:8px; width:80px;">Foto</th><th style="padding:8px; width:45%;">Produto</th><th style="padding:8px; text-align:center;">Estoque</th><th style="padding:8px;">${colAntigo}</th><th style="padding:8px;">${colNovo}</th><th style="padding:8px; text-align:right;">${colVar}</th>
                </tr></thead>
                <tbody>${items.map(item => `
                    <tr style="border-bottom:1px solid #ddd;">
                        <td style="padding:6px; text-align:center;">${imgThumb(item.codInt)}</td>
                        <td style="padding:6px;">
                            <strong style="font-size:1.05rem;">${item.mercadoria}</strong><br>
                            <small style="color:#555;">SAP: <strong>${item.codInt}</strong> &nbsp;|&nbsp; Ref: <strong>${item.fornecedorCod}</strong> &nbsp;|&nbsp; EAN: ${item.ean && item.ean !== 'N/A' && item.ean !== '-' ? item.ean : 'Sem EAN'}</small>
                        </td>
                        <td style="padding:6px; text-align:center; font-weight:800; font-size:1.2rem;">${item.estoque}</td>
                        ${renderRow(item)}
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>`;
    };

    contentHtml += buildSection('🔴 AUMENTOS', '#ef4444', currentGlobalData.aumentos, i => {
        const diff = i.novoPreco - i.precoAnterior;
        const pct = i.precoAnterior > 0 ? (diff / i.precoAnterior) * 100 : 0;
        return `<td style="padding:8px; color:#64748b; text-decoration:line-through;">${fmtMoney(i.precoAnterior)}</td>
                <td style="padding:8px; color:#ef4444; font-weight:bold; font-size:1.1rem;">${fmtMoney(i.novoPreco)}</td>
                <td style="padding:8px; color:#ef4444; font-weight:bold; text-align:right;">+ ${fmtMoney(diff)}<br><small>(+${pct.toFixed(1)}%)</small></td>`;
    }, ['Saindo de:', 'Aumentando para:', 'Aumento de:']);
    
    contentHtml += buildSection('🟠 TÉRMINOS DE OFERTA', '#f59e0b', currentGlobalData.terminosOferta, i => {
        const diff = i.novoPreco - i.precoAnterior;
        const pct = i.precoAnterior > 0 ? (diff / i.precoAnterior) * 100 : 0;
        return `<td style="padding:8px; color:#64748b; text-decoration:line-through;">${fmtMoney(i.precoAnterior)}</td>
                <td style="padding:8px; color:#d97706; font-weight:bold; font-size:1.1rem;">${fmtMoney(i.novoPreco)}</td>
                <td style="padding:8px; color:#d97706; font-weight:bold; text-align:right;">+ ${fmtMoney(diff)}<br><small>(+${pct.toFixed(1)}%)</small></td>`;
    }, ['Saindo da Oferta:', 'Voltando para:', 'Aumento de:']);
    
    contentHtml += buildSection('🟢 ENTRADAS DE OFERTA', '#10b981', currentGlobalData.entradasOferta, i => {
        const base = i.precoAnterior > 0 ? i.precoAnterior : i.novoPreco;
        const diff = base - i.promocao;
        const pct = base > 0 ? (diff / base) * 100 : 0;
        return `<td style="padding:8px; color:#64748b; text-decoration:line-through;">${fmtMoney(base)}</td>
                <td style="padding:8px; color:#10b981; font-weight:bold; font-size:1.1rem;">${fmtMoney(i.promocao)}</td>
                <td style="padding:8px; color:#10b981; font-weight:bold; text-align:right;">- ${fmtMoney(diff)}<br><small>(-${pct.toFixed(1)}%)</small></td>`;
    }, ['Preço Normal:', 'Oferta para:', 'Desconto de:']);
    
    contentHtml += buildSection('🔵 REBAIXAS', '#3b82f6', currentGlobalData.rebaixas, i => {
        const diff = i.precoAnterior - i.novoPreco;
        const pct = i.precoAnterior > 0 ? (diff / i.precoAnterior) * 100 : 0;
        return `<td style="padding:8px; color:#64748b; text-decoration:line-through;">${fmtMoney(i.precoAnterior)}</td>
                <td style="padding:8px; color:#3b82f6; font-weight:bold; font-size:1.1rem;">${fmtMoney(i.novoPreco)}</td>
                <td style="padding:8px; color:#3b82f6; font-weight:bold; text-align:right;">- ${fmtMoney(diff)}<br><small>(-${pct.toFixed(1)}%)</small></td>`;
    }, ['Saindo de:', 'Baixando para:', 'Redução de:']);


    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>${title}</title>
<style>
  html, body { height: 100%; margin: 0; padding: 0; }
  body { font-family: sans-serif; color: #333; padding: 20px; }
  @page { size: A4 landscape; margin: 0.8cm; }
  @media print { 
    .no-print { display: none !important; } 
    body { padding: 0; margin: 0; } 
    .section-container:last-of-type { border-bottom: none !important; }
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
