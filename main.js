import { processFile } from './parser.js';
import { getProductImage, saveProductImage, getCategoryIcon, scrapeImageFromRiHappy } from './store.js';
import QRCode from 'qrcode';

const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const resultsContainer = document.getElementById('results');
const btnPrint = document.getElementById('btn-print');
const btnNew = document.getElementById('btn-new');
const dropText = document.getElementById('drop-text');

// Modos
const btnModeTable = document.getElementById('btn-mode-table');
const btnModeScan = document.getElementById('btn-mode-scan');
const viewTable = document.getElementById('view-table');
const viewScan = document.getElementById('view-scan');

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

// Compartilhamento (PeerJS)
const btnShareMobile = document.getElementById('btn-share-mobile');
const qrModal = document.getElementById('qr-modal');
const btnQrCancel = document.getElementById('btn-qr-cancel');
const qrcodeContainer = document.getElementById('qrcode-container');
const qrStatus = document.getElementById('qr-status');
const mobileLoading = document.getElementById('mobile-loading');
const mobileStatusText = document.getElementById('mobile-status-text');

// Scanner de Produto Mobile (câmera no modo varredura)
const btnOpenScanner = document.getElementById('btn-open-scanner');
const scannerModal = document.getElementById('scanner-modal');
const btnScannerCancel = document.getElementById('btn-scanner-cancel');
const scannerStatus = document.getElementById('scanner-status');
let html5QrcodeScanner = null;

// Tela Mobile (QR Code nativo)
const mobileQrReader = document.getElementById('mobile-qr-reader');
const btnStartMobileScan = document.getElementById('btn-start-mobile-scan');
const mobileQrStatus = document.getElementById('mobile-qr-status');
const mobileQrReaderView = document.getElementById('mobile-qr-reader-view');
const fileInputMobile = document.getElementById('file-input-mobile');
let mobileQrScanner = null;

let currentGlobalData = null;
let currentAddingImageCode = null;
let currentAddingImageName = null;

// Varredura (Scan)
let scanQueue = [];
let currentScanIndex = 0;
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
    window.print();
});

btnNew.addEventListener('click', () => {
    resultsContainer.classList.add('hidden');
    dropZone.style.display = 'block';
    statBox.classList.add('hidden');
    fileInput.value = '';
    dropText.textContent = "Aguardando arquivo...";
    startTime = null;
    
    // Limpa URL se recomeçar
    window.history.replaceState({}, document.title, window.location.pathname);
});

// Modos de Visualização
btnModeTable.addEventListener('click', () => {
    btnModeTable.classList.add('active');
    btnModeScan.classList.remove('active');
    viewTable.classList.remove('hidden');
    viewScan.classList.add('hidden');
});

btnModeScan.addEventListener('click', () => {
    btnModeScan.classList.add('active');
    btnModeTable.classList.remove('active');
    viewScan.classList.remove('hidden');
    viewTable.classList.add('hidden');
    initScanMode();
});

// Modal Logic
window.openImageModal = function(codInt, productName, ean) {
    currentAddingImageCode = codInt;
    currentAddingImageName = productName;
    imgUrlInput.value = '';
    
    // Links para ajudar a achar a imagem
    const query = encodeURIComponent(productName);
    const googleLink = `<a href="https://www.google.com/search?tbm=isch&q=${query}" target="_blank">🔍 Buscar no Google Imagens</a>`;
    
    // Se não tiver EAN (N/A ou traço), usa o código SAP para montar o link manual
    const rihappyQuery = (ean && ean !== 'N/A' && ean !== '-') ? ean : codInt;
    const rihappyLink = `<a href="https://www.rihappy.com.br/${rihappyQuery}/rihappy?map=ft,vendido-por" target="_blank">🧸 Buscar na RiHappy</a>`;

    searchHelperLinks.innerHTML = `${googleLink} ${rihappyLink}`;
    modal.classList.remove('hidden');
};

// Lightbox: Visualizar imagem ampliada
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

// Fechar lightbox com ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.closeLightbox();
});

btnModalCancel.addEventListener('click', () => {
    modal.classList.add('hidden');
});

btnModalSave.addEventListener('click', () => {
    const url = imgUrlInput.value.trim();
    if (url) {
        saveProductImage(currentAddingImageCode, url, currentAddingImageName);
        modal.classList.add('hidden');
        // Re-render
        if (currentGlobalData) {
            renderResults(currentGlobalData);
            if (btnModeScan.classList.contains('active')) {
                renderCurrentScanCard();
            }
        }
    }
});


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
        
        // Iniciar cronômetro
        startTime = new Date();
        statStart.textContent = startTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute:'2-digit' });
        statEnd.textContent = '--:--';
        statDuration.textContent = '-- min';
        statBox.classList.remove('hidden');

        renderResults(data);
        resultsContainer.classList.remove('hidden');
        dropZone.style.display = 'none';
        
        // Atualiza a fila do Scanner
        buildScanQueue(data);
        
        // Iniciar robozinho de scrape invisível!
        runAutoScraperInBackground();

    } catch (error) {
        console.error(error);
        alert("Ocorreu um erro ao ler o arquivo. Tem certeza de que é o relatório correto?");
        dropText.textContent = "Aguardando arquivo...";
    }
}

// === LOGICA DE COMPARTILHAMENTO VIA NUVEM (VERCEL KV) ===
btnShareMobile.addEventListener('click', async () => {
    if (!currentGlobalData) return;
    
    qrModal.classList.remove('hidden');
    qrcodeContainer.innerHTML = '';
    qrStatus.innerHTML = '<div class="loader-inline"><div class="spinner"></div> Criando sessão na nuvem...</div>';
    qrStatus.style.color = '#1565c0';

    try {
        const response = await fetch('/api/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentGlobalData)
        });
        
        const data = await response.json();
        
        if (!response.ok || !data.success) {
            throw new Error(data.error || data.message || "Falha ao criar sessão");
        }
        
        const sessionId = data.sessionId;
        const hostUrl = window.location.protocol + '//' + window.location.host + window.location.pathname;
        const connectUrl = `${hostUrl}?session_id=${sessionId}`;
        
        QRCode.toCanvas(connectUrl, { width: 250, margin: 2 }, function (err, canvas) {
            if (err) console.error(err);
            qrcodeContainer.innerHTML = '';
            qrcodeContainer.appendChild(canvas);
            qrStatus.textContent = `Sessão [${sessionId}] pronta! Escaneie pelo celular para sincronizar.`;
            qrStatus.style.color = '#2e7d32'; // success
        });
        
    } catch (error) {
        console.error(error);
        qrStatus.textContent = `Erro: ${error.message}.`;
        qrStatus.style.color = '#d32f2f'; // error
    }
});

btnQrCancel.addEventListener('click', () => {
    qrModal.classList.add('hidden');
});

// Inicialização: Detecção de Mobile/Desktop e ?session_id=
window.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
                     || window.innerWidth <= 768;

    if (sessionId) {
        // Ativar Modo Conferência
        document.body.classList.add('session-mode');
        mobileLoading.classList.remove('hidden');
        dropZone.style.display = 'none';
        if(mobileQrReader) mobileQrReader.classList.add('hidden');
        mobileStatusText.innerHTML = '<div class="loader-inline"><div class="spinner light"></div> Buscando sessão na nuvem...</div>';
        
        try {
            const response = await fetch(`/api/session?id=${sessionId}`);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || "Sessão expirada ou não encontrada.");
            }
            
            mobileStatusText.innerHTML = '<div class="loader-inline"><div class="spinner light"></div> Montando interface...</div>';
            currentGlobalData = typeof data === 'string' ? JSON.parse(data) : data;
            
            startTime = new Date();
            statStart.textContent = startTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute:'2-digit' });
            statEnd.textContent = '--:--';
            statDuration.textContent = '-- min';
            statBox.classList.remove('hidden');

            renderResults(currentGlobalData);
            buildScanQueue(currentGlobalData);
            resultsContainer.classList.remove('hidden');
            mobileLoading.classList.add('hidden');
            btnModeScan.click();
            runAutoScraperInBackground();
            
        } catch (error) {
            console.error(error);
            mobileStatusText.textContent = `Erro: ${error.message}`;
            mobileStatusText.style.color = '#ffcdd2';
        }
    } else if (isMobile) {
        // Mobile sem session_id: exibe tela de leitura de QR Code
        dropZone.style.display = 'none';
        mobileQrReader.classList.remove('hidden');
    }
});

// Botão de iniciar leitor de QR Code para session_id
if (btnStartMobileScan) {
    btnStartMobileScan.addEventListener('click', () => {
        mobileQrReaderView.style.display = 'block';
        btnStartMobileScan.style.display = 'none';
        mobileQrStatus.textContent = 'Aponte para o QR Code da tela do computador...';
        mobileQrStatus.style.color = '#6a11cb';

        mobileQrScanner = new Html5Qrcode('mobile-qr-reader-view');
        mobileQrScanner.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            async (decodedText) => {
                // Parar a câmera imediatamente
                await mobileQrScanner.stop();
                mobileQrReaderView.style.display = 'none';
                
                // Tentar extrair session_id da URL decodificada
                try {
                    const url = new URL(decodedText);
                    const sid = url.searchParams.get('session_id');
                    if (sid) {
                        mobileQrStatus.innerHTML = '<div class="loader-inline"><div class="spinner"></div> Carregando lista...</div>';
                        mobileQrStatus.style.color = '#1565c0';
                        window.location.href = decodedText;
                    } else {
                        mobileQrStatus.textContent = '⚠️ QR Code inválido. Escaneie o código gerado pelo sistema.';
                        mobileQrStatus.style.color = '#ef4444';
                        btnStartMobileScan.style.display = 'block';
                    }
                } catch (e) {
                    mobileQrStatus.textContent = '⚠️ QR Code não reconhecido.';
                    mobileQrStatus.style.color = '#ef4444';
                    btnStartMobileScan.style.display = 'block';
                }
            },
            () => {} // erros de frame: ignorar
        ).catch(err => {
            mobileQrStatus.textContent = '⚠️ Permissão de câmera negada.';
            mobileQrStatus.style.color = '#ef4444';
            btnStartMobileScan.style.display = 'block';
        });
    });
}

// Upload direto de arquivo no celular
if (fileInputMobile) {
    fileInputMobile.addEventListener('change', (e) => {
        if (e.target.files.length) {
            mobileQrReader.classList.add('hidden');
            handleFile(e.target.files[0]);
        }
    });
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
        // Foto: clicar abre lightbox; ícone de lápis abre modal de edição
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
    const colspan = document.querySelector(`#${tableId} thead tr`).children.length;
    
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
        // Group Header (só exibe se tiver fornecedor real)
        if (fornecedor !== 'SEM_FORNECEDOR') {
            const headerTr = document.createElement('tr');
            headerTr.innerHTML = `<td colspan="${colspan}" class="supplier-row">
                <strong>${fornecedor.startsWith('Fornecedor') ? fornecedor : 'Fornecedor: ' + fornecedor}</strong>
            </td>`;
            tbody.appendChild(headerTr);
        }

        // Ordenar os itens pela maior diferença de preço
        groupedItems.sort((a, b) => {
            const getDiff = (item) => {
                if (item.promocao > 0) {
                    const basePrice = item.precoAnterior > 0 ? item.precoAnterior : item.novoPreco;
                    return Math.abs(basePrice - item.promocao);
                }
                return Math.abs(item.novoPreco - item.precoAnterior);
            };
            return getDiff(b) - getDiff(a); // Decrescente
        });

        // Group Items
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
    // Render Aumentos
    populateTableGrouped('table-aumentos', data.aumentos, (item) => `
        <td class="price">${formatMoney(item.precoAnterior)}</td>
        <td class="price" style="color: var(--danger-color);">${formatMoney(item.novoPreco)} ${getDiffBadge(item.precoAnterior, item.novoPreco, false)}</td>
    `, 'var(--danger-color)');

    // Render Ofertas
    populateTableGrouped('table-ofertas', data.entradasOferta, (item) => {
        const basePrice = item.precoAnterior > 0 ? item.precoAnterior : item.novoPreco;
        return `
        <td class="price">${formatMoney(basePrice)}</td>
        <td class="price" style="color: var(--success-color);">${formatMoney(item.promocao)} ${getDiffBadge(basePrice, item.promocao, false)}</td>
        `;
    }, 'var(--success-color)');

    // Render Rebaixas
    populateTableGrouped('table-rebaixas', data.rebaixas, (item) => `
        <td class="price">${formatMoney(item.precoAnterior)}</td>
        <td class="price" style="color: var(--info-color);">${formatMoney(item.novoPreco)} ${getDiffBadge(item.precoAnterior, item.novoPreco, true)}</td>
    `, 'var(--info-color)');

    // Render Términos
    populateTableGrouped('table-terminos', data.terminosOferta, (item) => `
        <td class="price">${formatMoney(item.precoAnterior)}</td>
        <td class="price" style="color: var(--warning-color);">${formatMoney(item.novoPreco)} ${getDiffBadge(item.precoAnterior, item.novoPreco, false)}</td>
    `, 'var(--warning-color)');
}

// === LOGICA DO MODO VARREDURA (SCAN) ===
let completedScans = [];

// === LOGICA DO LEITOR DE CODIGO DE BARRAS (MOBILE) ===
btnOpenScanner.addEventListener('click', () => {
    scannerModal.classList.remove('hidden');
    scannerStatus.textContent = "Aguardando leitura... Posicione o código.";
    scannerStatus.style.color = "#666";

    if (!html5QrcodeScanner) {
        html5QrcodeScanner = new Html5QrcodeScanner(
            "reader",
            { fps: 10, qrbox: { width: 250, height: 150 } },
            false
        );
    }

    html5QrcodeScanner.render(onScanSuccess, onScanFailure);
});

btnScannerCancel.addEventListener('click', () => {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.clear().catch(e => console.error("Falha ao limpar scanner", e));
    }
    scannerModal.classList.add('hidden');
});

function onScanSuccess(decodedText, decodedResult) {
    const scannedCode = decodedText.trim();
    scannerStatus.textContent = `Lido: ${scannedCode}. Buscando...`;
    scannerStatus.style.color = "blue";
    
    // Procura o item na fila de varredura (EAN ou SAP)
    // Tenta bater com ean exato ou ignorar zeros a esquerda
    const foundIndex = scanQueue.findIndex(item => {
        if (item.ean === scannedCode || item.codInt === scannedCode) return true;
        // Tenta bater sem os zeros a esquerda do EAN caso o sistema ou o leitor retorne diferente
        if (item.ean && parseInt(item.ean, 10) === parseInt(scannedCode, 10)) return true;
        return false;
    });

    if (foundIndex !== -1) {
        // Encontrou!
        currentScanIndex = foundIndex;
        renderCurrentScanCard();
        
        // Efeito sonoro simples de beep usando um arquivo livre da web
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3');
        audio.play().catch(e => console.log(e)); // Ignora erro se autoplay bloqueado
        
        btnScannerCancel.click(); // Fecha modal
    } else {
        scannerStatus.textContent = `⚠️ Produto ${scannedCode} não está nesta lista de troca!`;
        scannerStatus.style.color = "red";
    }
}

function onScanFailure(error) {
    // Ignora chamadas contínuas de frame sem leitura
}

function buildScanQueue(data) {
    scanQueue = [];
    completedScans = [];
    
    // Anexa um "tipo" e formatação base em cada item para a fila
    const mapItems = (arr, type, label, cssClass) => {
        return arr.map(item => ({ ...item, scanType: type, scanLabel: label, scanClass: cssClass, checkedLocations: [] }));
    };

    // Foco Total em Erro de Preço: Aumentos e Fim de Oferta
    scanQueue = scanQueue.concat(mapItems(data.aumentos, 'aumento', 'AUMENTO DE PREÇO', 'aumento'));
    scanQueue = scanQueue.concat(mapItems(data.terminosOferta, 'termino', 'TÉRMINO DE OFERTA', 'aumento'));

    // Ordenar a fila inteira globalmente pela diferença matemática absoluta (para forçar os piores casos primeiro)
    scanQueue.sort((a, b) => {
        const getDiff = (item) => {
            if (item.promocao > 0) {
                const basePrice = item.precoAnterior > 0 ? item.precoAnterior : item.novoPreco;
                return Math.abs(basePrice - item.promocao);
            }
            return Math.abs(item.novoPreco - item.precoAnterior);
        };
        return getDiff(b) - getDiff(a);
    });

    currentScanIndex = 0;
}

function initScanMode() {
    if (scanQueue.length === 0) {
        document.getElementById('scan-card-container').innerHTML = '';
        document.getElementById('scan-finished-state').classList.remove('hidden');
        return;
    }
    document.getElementById('scan-finished-state').classList.add('hidden');
    renderCurrentScanCard();
}

function renderCurrentScanCard() {
    if (currentScanIndex >= scanQueue.length) {
        document.getElementById('scan-card-container').innerHTML = '';
        document.getElementById('scan-finished-state').classList.remove('hidden');
        return;
    }

    const item = scanQueue[currentScanIndex];
    const container = document.getElementById('scan-card-container');
    
    // Atualiza Progresso
    const progressPercent = ((currentScanIndex) / scanQueue.length) * 100;
    document.getElementById('scan-progress-fill').style.width = `${progressPercent}%`;
    document.getElementById('scan-current').textContent = currentScanIndex;
    document.getElementById('scan-total').textContent = scanQueue.length;

    // Imagem
    const savedImg = getProductImage(item.codInt);
    let imgDisplay = `<div class="no-image-scan">${getCategoryIcon(item.mercadoria)}</div>`;
    if (savedImg) {
        imgDisplay = `<img src="${savedImg}" alt="Product" />`;
    }

    // Preços
    let basePrice = item.precoAnterior;
    let finalPrice = item.novoPreco;
    if (item.scanType === 'oferta') {
        basePrice = item.precoAnterior > 0 ? item.precoAnterior : item.novoPreco;
        finalPrice = item.promocao;
    }

    const badge = getDiffBadge(basePrice, finalPrice, item.scanType === 'rebaixa');

    const cardHtml = `
        <div class="scan-card ${item.scanClass}">
            <div class="scan-card-header">
                <span>🔴 ${item.scanLabel}</span>
                <span>Estoque: ${item.estoque}</span>
            </div>
            <div class="scan-card-body">
                <div class="scan-image-wrap" onclick="openImageModal('${item.codInt}', '${item.mercadoria.replace(/'/g, "\\'")}', '${item.ean}')">
                    ${imgDisplay}
                </div>
                <div class="scan-title">${item.mercadoria}</div>
                <div class="scan-meta">SAP: ${item.codInt} | EAN: ${item.ean && item.ean !== 'N/A' ? item.ean : '-'}</div>

                <div class="scan-price-row">
                    <div class="scan-price-col">
                        <span class="scan-price-label">De (R$)</span>
                        <span class="scan-price-val">${formatMoney(basePrice)}</span>
                    </div>
                    <div class="scan-price-col">
                        <span class="scan-price-label">Para (R$)</span>
                        <span class="scan-price-val new-p">${formatMoney(finalPrice)} ${badge}</span>
                    </div>
                </div>

                <div class="scan-instructions">
                    <p><strong>Passo a Passo:</strong></p>
                    <ol>
                        <li>Vá até a loja e encontre este produto.</li>
                        <li>Imprima a etiqueta com o preço de <strong>Para (R$)</strong>.</li>
                        <li>Retire a etiqueta antiga e cole a nova.</li>
                    </ol>
                </div>

                <div class="scan-checklist">
                    <h4>⚠️ Onde você já trocou a etiqueta? Marque abaixo:</h4>
                    <label><input type="checkbox" value="Ponto Natural" class="chk-loc"> Ponto Natural</label>
                    <label><input type="checkbox" value="Pontas de Gôndola" class="chk-loc"> Pontas de Gôndola</label>
                    <label><input type="checkbox" value="Vitrine / Especial" class="chk-loc"> Vitrine / Especial</label>
                </div>
            </div>
            <div class="scan-actions">
                <button class="btn-scan issue" onclick="skipItemNotFound()">❓ Não Encontrado</button>
                <button class="btn-scan done" onclick="nextScanItem()">✅ Etiqueta Trocada</button>
            </div>
        </div>
    `;

    container.innerHTML = cardHtml;
}

window.nextScanItem = function() {
    const currentItem = scanQueue[currentScanIndex];
    
    // Coletar as opções marcadas
    const checkboxes = document.querySelectorAll('.chk-loc:checked');
    const checkedVals = Array.from(checkboxes).map(cb => cb.value);
    
    // Registrar na lista de concluídos
    completedScans.push({
        ...currentItem,
        checkedLocations: checkedVals.length > 0 ? checkedVals : ['Nenhum local marcado'],
        status: 'Resolvido'
    });

    currentScanIndex++;
    renderCurrentScanCard();
};

window.skipItemNotFound = function() {
    const currentItem = scanQueue[currentScanIndex];
    // Se não encontrou de primeira, vai para o final com a marcação de 2ª Busca
    // Apenas se ainda não for a 2ª busca, para evitar loop infinito
    if (!currentItem.scanLabel.includes('2ª Busca')) {
        const retriedItem = { ...currentItem, scanLabel: currentItem.scanLabel + ' (2ª Busca)' };
        scanQueue.push(retriedItem);
    } else {
        // Desistiu na 2ª busca
        completedScans.push({
            ...currentItem,
            checkedLocations: ['NÃO ENCONTRADO NA LOJA'],
            status: 'Pendente'
        });
    }

    currentScanIndex++;
    renderCurrentScanCard();
};

document.getElementById('btn-generate-report').addEventListener('click', () => {
    const collabName = document.getElementById('collaborator-name').value.trim();
    if (!collabName) {
        alert("Por favor, digite o nome do colaborador!");
        return;
    }

    // Registrar Fim de Operação
    const endTime = new Date();
    statEnd.textContent = endTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute:'2-digit' });
    
    let diffMins = 0;
    if (startTime) {
        const diffMs = endTime - startTime;
        diffMins = Math.round(diffMs / 60000);
        statDuration.textContent = `${diffMins} min`;
    }

    // Gerar Relatório HTML
    const reportContainer = document.getElementById('scan-summary-report');
    document.getElementById('scan-finish-form').style.display = 'none';
    
    let html = `
        <h3 style="color: var(--primary-color); border-bottom: 2px solid var(--primary-color); padding-bottom: 5px; margin-bottom: 15px;">
            Relatório de Varredura - Prevenção a Erros de Preço
        </h3>
        <p><strong>Colaborador:</strong> ${collabName}</p>
        <p><strong>Duração da Varredura:</strong> ${diffMins} minutos</p>
        <p><strong>Total de Itens Processados:</strong> ${completedScans.length}</p>
        
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 0.9rem;">
            <thead>
                <tr>
                    <th style="border-bottom: 2px solid #ccc; padding: 8px; text-align: left;">SAP</th>
                    <th style="border-bottom: 2px solid #ccc; padding: 8px; text-align: left;">Descrição</th>
                    <th style="border-bottom: 2px solid #ccc; padding: 8px; text-align: left;">Status</th>
                    <th style="border-bottom: 2px solid #ccc; padding: 8px; text-align: left;">Locais Verificados</th>
                </tr>
            </thead>
            <tbody>
    `;

    completedScans.forEach(item => {
        const statusColor = item.status === 'Resolvido' ? 'green' : 'red';
        html += `
            <tr>
                <td style="border-bottom: 1px solid #eee; padding: 8px;">${item.codInt}</td>
                <td style="border-bottom: 1px solid #eee; padding: 8px;"><strong>${item.mercadoria}</strong></td>
                <td style="border-bottom: 1px solid #eee; padding: 8px; color: ${statusColor}; font-weight: bold;">${item.status}</td>
                <td style="border-bottom: 1px solid #eee; padding: 8px;">${item.checkedLocations.join(', ')}</td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
        
        <div style="margin-top: 20px;">
            <button class="btn-print" onclick="window.print()">Imprimir Relatório Final</button>
        </div>
    `;

    reportContainer.innerHTML = html;
    reportContainer.classList.remove('hidden');
});

// === LOGICA DO ROBO AUTO-SCRAPER ===
async function runAutoScraperInBackground() {
    // Pegar todos os itens únicos na fila do scan que não tenham foto
    const itemsToScrape = scanQueue.filter(item => {
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

    // Busca uma por uma para não sobrecarregar
    for (const item of itemsToScrape) {
        // Se a imagem já foi adicionada manualmente no meio tempo, pula
        if (getProductImage(item.codInt)) continue;

        if(scraperText) scraperText.textContent = `Buscando foto: ${item.mercadoria.substring(0, 15)}...`;

        const queryId = (item.ean && item.ean !== 'N/A' && item.ean !== '-') ? item.ean :
                        ((item.fornecedorCod && item.fornecedorCod !== 'N/A' && item.fornecedorCod !== '-') ? item.fornecedorCod : item.codInt);

        const imageUrl = await scrapeImageFromRiHappy(queryId);
        if (imageUrl) {
            console.log(`✨ Imagem resgatada com sucesso para: ${item.mercadoria}`);
            saveProductImage(item.codInt, imageUrl, item.mercadoria);
            
            // Re-renderizar UI silenciosamente para a foto pipocar na tela
            if (currentGlobalData) renderResults(currentGlobalData);
            if (btnModeScan.classList.contains('active')) renderCurrentScanCard();
        }
        
        // Pausa de 1 segundo para não tomar ban do site da RiHappy
        await new Promise(r => setTimeout(r, 1000));
    }

    if(scraperIndicator) scraperIndicator.classList.remove('visible');
}
