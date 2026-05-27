import { processFile } from './parser.js';
import { getProductImage, saveProductImage, deleteProductImage, getCategoryIcon, scrapeImageFromRiHappy, getDatabase, saveDatabase } from './store.js';
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
let currentAddingImageEan = null;
window.isScraping = false;

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
    if (window.generatePrintReport) window.generatePrintReport('full');
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
    currentAddingImageEan = ean;
    imgUrlInput.value = '';
    
    const statusDiv = document.getElementById('modal-scrape-status');
    if (statusDiv) statusDiv.textContent = '';
    
    // Links para ajudar a achar a imagem
    const query = encodeURIComponent(productName);
    const googleLink = `<a href="https://www.google.com/search?tbm=isch&q=${query}" target="_blank">🔍 Buscar no Google Imagens</a>`;
    
    // Se não tiver EAN (N/A ou traço), usa o código SAP para montar o link manual
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
    if (url && currentAddingImageCode) {
        saveProductImage(currentAddingImageCode, url, currentAddingImageName);
        if (currentGlobalData) renderResults(currentGlobalData);
        if (btnModeScan.classList.contains('active')) renderCurrentScanCard();
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
            // Salva e fecha direto
            saveProductImage(currentAddingImageCode, imageUrl, currentAddingImageName);
            if (currentGlobalData) renderResults(currentGlobalData);
            if (btnModeScan.classList.contains('active')) renderCurrentScanCard();
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
            if (btnModeScan.classList.contains('active')) renderCurrentScanCard();
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
        // Empacotar dados da planilha + banco de imagens do PC juntos
        const imageDb = getDatabase();
        const payload = { productData: currentGlobalData, imageDb };
        const response = await fetch('/api/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
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
            
            // Desempacotar payload: pode vir no formato novo (com imagens) ou antigo (só dados)
            const payload = typeof data === 'string' ? JSON.parse(data) : data;
            if (payload.productData && payload.imageDb) {
                // Formato novo: restaura banco de imagens no localStorage do celular
                saveDatabase(payload.imageDb);
                currentGlobalData = payload.productData;
            } else {
                // Formato legado (sessões antigas sem imagens)
                currentGlobalData = payload;
            }
            
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
        
        // Esconder coisas para maximizar espaço de tela
        document.getElementById('qr-instructions').style.display = 'none';
        document.getElementById('qr-bottom-actions').style.display = 'none';
        document.querySelector('.app-header').style.display = 'none';
        document.getElementById('btn-cancel-mobile-scan').style.display = 'block';

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
                document.getElementById('btn-cancel-mobile-scan').style.display = 'none';
                document.querySelector('.app-header').style.display = 'flex';
                
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
                        document.getElementById('qr-instructions').style.display = 'block';
                        document.getElementById('qr-bottom-actions').style.display = 'block';
                        btnStartMobileScan.style.display = 'block';
                    }
                } catch (e) {
                    mobileQrStatus.textContent = '⚠️ QR Code não reconhecido.';
                    mobileQrStatus.style.color = '#ef4444';
                    document.getElementById('qr-instructions').style.display = 'block';
                    document.getElementById('qr-bottom-actions').style.display = 'block';
                    btnStartMobileScan.style.display = 'block';
                }
            },
            (errorMessage) => {
                // IGNORAR erros de não leitura
            }
        ).catch(err => {
            console.error("Erro ao iniciar câmera: ", err);
            mobileQrStatus.textContent = "Erro ao acessar a câmera. Verifique as permissões.";
            mobileQrStatus.style.color = '#ef4444';
            document.getElementById('qr-instructions').style.display = 'block';
            document.getElementById('qr-bottom-actions').style.display = 'block';
            document.querySelector('.app-header').style.display = 'flex';
            document.getElementById('btn-cancel-mobile-scan').style.display = 'none';
            btnStartMobileScan.style.display = 'block';
        });
    });

    const btnCancelMobileScan = document.getElementById('btn-cancel-mobile-scan');
    if (btnCancelMobileScan) {
        btnCancelMobileScan.addEventListener('click', async () => {
            if (mobileQrScanner) {
                try {
                    await mobileQrScanner.stop();
                } catch(e) { console.error(e); }
            }
            mobileQrReaderView.style.display = 'none';
            btnCancelMobileScan.style.display = 'none';
            btnStartMobileScan.style.display = 'block';
            
            document.getElementById('qr-instructions').style.display = 'block';
            document.getElementById('qr-bottom-actions').style.display = 'block';
            document.querySelector('.app-header').style.display = 'flex';
            
            mobileQrStatus.textContent = '';
        });
    }
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
        if (btnStartMobileScan) btnStartMobileScan.style.display = 'none';
        return;
    }

    const item = scanQueue[currentScanIndex];
    const container = document.getElementById('scan-card-container');
    
    // Atualiza Progresso
    const progressPercent = ((currentScanIndex) / scanQueue.length) * 100;
    document.getElementById('scan-progress-fill').style.width = `${progressPercent}%`;
    document.getElementById('scan-current').textContent = currentScanIndex + 1;
    document.getElementById('scan-total').textContent = scanQueue.length;

    // Imagem
    const savedImg = getProductImage(item.codInt);
    let imgDisplay = '';
    
    if (savedImg) {
        imgDisplay = `<img src="${savedImg}" alt="Product" />`;
    } else {
        if (window.isScraping) {
            imgDisplay = `<div class="no-image-scan" style="display:flex; flex-direction:column; gap:10px;">
                            <div class="spinner" style="width: 30px; height: 30px; border-width: 3px; border-top-color: #10b981; margin:0 auto;"></div>
                            <span style="font-size:0.9rem; color:#666;">Buscando foto...</span>
                          </div>`;
        } else {
            imgDisplay = `<div class="no-image-scan">${getCategoryIcon(item.mercadoria)}</div>`;
        }
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
                    <div style="font-size: 0.8rem; color: #666; margin-top: 5px;">📝 Clique na foto para revisar/alterar</div>
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
    if (checkboxes.length === 0) {
        alert("Por favor, marque pelo menos um local onde você verificou ou trocou a etiqueta.");
        return;
    }
    const checkedVals = Array.from(checkboxes).map(cb => cb.value);
    
    // Registrar na lista de concluídos
    completedScans.push({
        ...currentItem,
        checkedLocations: checkedVals,
        status: 'Resolvido'
    });

    currentScanIndex++;
    renderCurrentScanCard();
};

window.skipItemNotFound = function() {
    const currentItem = scanQueue[currentScanIndex];
    
    const checkboxes = document.querySelectorAll('.chk-loc:checked');
    if (checkboxes.length === 0) {
        alert("Por favor, marque em quais locais você procurou antes de declarar como Não Encontrado.");
        return;
    }
    const checkedVals = Array.from(checkboxes).map(cb => cb.value);

    // Se não encontrou de primeira, vai para o final com a marcação de 2ª Busca
    // Apenas se ainda não for a 2ª busca, para evitar loop infinito
    if (!currentItem.scanLabel.includes('2ª Busca')) {
        const retriedItem = { ...currentItem, scanLabel: currentItem.scanLabel + ' (2ª Busca)' };
        scanQueue.push(retriedItem);
    } else {
        // Desistiu na 2ª busca
        completedScans.push({
            ...currentItem,
            checkedLocations: checkedVals,
            status: 'Pendente'
        });
    }

    currentScanIndex++;
    renderCurrentScanCard();
};

document.getElementById('btn-generate-report').addEventListener('click', () => {
    const collabName = document.getElementById('collaborator-name').value.trim();
    const collabId = document.getElementById('collaborator-id').value.trim();
    
    if (!collabName || !collabId) {
        alert("Por favor, preencha seu Nome e Matrícula!");
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
            <button class="btn-print" onclick="if(window.generatePrintReport) window.generatePrintReport('scan')">Imprimir Relatório Final</button>
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
    
    window.isScraping = true;
    if (btnModeScan.classList.contains('active')) renderCurrentScanCard();

    // Busca uma por uma para não sobrecarregar
    for (const item of itemsToScrape) {
        // Se a imagem já foi adicionada manualmente no meio tempo, pula
        if (getProductImage(item.codInt)) continue;

        if(scraperText) scraperText.textContent = `Buscando foto: ${item.mercadoria.substring(0, 15)}...`;

        const queryId = (item.ean && item.ean !== 'N/A' && item.ean !== '-') ? item.ean : item.codInt;

        const imageUrl = await scrapeImageFromRiHappy(queryId);
        if (imageUrl) {
            console.log(`✨ Imagem resgatada com sucesso para: ${item.mercadoria}`);
            saveProductImage(item.codInt, imageUrl, item.mercadoria);
            
            // Re-renderizar UI silenciosamente para a foto pipocar na tela
            if (currentGlobalData) renderResults(currentGlobalData);
            if (btnModeScan.classList.contains('active')) renderCurrentScanCard();
        }
        
        // Pequena pausa
        await new Promise(r => setTimeout(r, 1000));
    }

    if(scraperIndicator) scraperIndicator.classList.remove('visible');
    window.isScraping = false;
    if (btnModeScan.classList.contains('active')) renderCurrentScanCard();
}

// === GERADOR DE RELATÓRIO PDF PERSONALIZADO ===
window.generatePrintReport = function(mode = 'full') {
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

    if (mode === 'full') {
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

    } else if (mode === 'scan') {
        const cName = document.getElementById('collaborator-name')?.value || 'Não informado';
        const cId = document.getElementById('collaborator-id')?.value || '-';
        const collabName = `${cName} (Matrícula: ${cId})`;
        
        const dayStr = now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        title = `Alteração de Preço Dia ${dayStr} - ${cName}`;
        
        // Identificar produtos únicos que foram resolvidos
        const resolvidosMap = new Map();
        completedScans.forEach(s => {
            if (s.status === 'Resolvido') {
                resolvidosMap.set(s.codInt, s);
            }
        });
        
        const naoEncontradosMap = new Map();
        completedScans.forEach(s => {
            if (s.status === 'Pendente' && !resolvidosMap.has(s.codInt)) {
                naoEncontradosMap.set(s.codInt, s);
            }
        });

        const pendentesQueue = scanQueue.filter(q => !resolvidosMap.has(q.codInt) && !naoEncontradosMap.has(q.codInt));

        const uniqResolvidos = Array.from(resolvidosMap.values());
        const uniqNaoEncontrados = Array.from(naoEncontradosMap.values());
        const uniqTotal = uniqResolvidos.length + uniqNaoEncontrados.length + pendentesQueue.length;

        summaryHtml = `
        <div class="summary-bar">
          <div class="summary-box info"><div class="count">${collabName}</div><div class="label">Colaborador</div></div>
          <div class="summary-box success"><div class="count">${uniqResolvidos.length}</div><div class="label">Etiqueta Trocada</div></div>
          <div class="summary-box warning"><div class="count">${uniqNaoEncontrados.length}</div><div class="label">Não Encontrados</div></div>
          <div class="summary-box danger"><div class="count">${pendentesQueue.length}</div><div class="label">Não Verificados</div></div>
          <div class="summary-box"><div class="count">${uniqTotal}</div><div class="label">Total da Varredura</div></div>
        </div>`;

        const buildTable = (arr) => {
            if (!arr || !arr.length) return '<p style="color:#666; font-size:0.9rem;">Nenhum item nesta categoria.</p>';
            return `
            <table style="width:100%; border-collapse:collapse; font-size:0.8rem;">
                <thead><tr style="background:#f5f5f5; text-align:left;">
                    <th style="padding:6px;">Foto</th><th style="padding:6px;">SAP</th><th style="padding:6px;">Produto</th><th style="padding:6px;">Status</th><th style="padding:6px;">Locais / Observações</th>
                </tr></thead>
                <tbody>${arr.map(item => `
                    <tr style="border-bottom:1px solid #ddd;">
                        <td style="padding:6px;">${imgThumb(item.codInt)}</td>
                        <td style="padding:6px;">${item.codInt}</td>
                        <td style="padding:6px;"><strong>${item.mercadoria}</strong></td>
                        <td style="padding:6px; font-weight:bold; color:${item.status === 'Resolvido' ? '#10b981' : (item.status === 'Pendente' ? '#f59e0b' : '#ef4444')}">${item.status || 'Não Verificado'}</td>
                        <td style="padding:6px;">${(item.checkedLocations && item.checkedLocations.length > 0) ? item.checkedLocations.join(', ') : '-'}</td>
                    </tr>`).join('')}
                </tbody>
            </table>`;
        };

        contentHtml += `<div class="section-container" style="margin-bottom:28px;"><h3 style="margin-bottom:10px; color:#10b981;">✅ Etiquetas Trocadas</h3>${buildTable(uniqResolvidos)}</div>`;
        if (uniqNaoEncontrados.length > 0) {
            contentHtml += `<div class="section-container" style="margin-bottom:28px;"><h3 style="margin-bottom:10px; color:#f59e0b;">⚠️ Não Encontrados na Loja</h3>${buildTable(uniqNaoEncontrados)}</div>`;
        }
        if (pendentesQueue.length > 0) {
            contentHtml += `<div class="section-container" style="margin-bottom:28px;"><h3 style="margin-bottom:10px; color:#ef4444;">🔴 Não Verificados pelo Colaborador</h3>${buildTable(pendentesQueue)}</div>`;
        }
    }

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>${title}</title>
<style>
  html, body { height: 100%; margin: 0; padding: 0; }
  body { font-family: sans-serif; color: #333; padding: 20px; }
  @page { size: A4 landscape; margin: 1cm; }
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
    const text = "📋 *${title}*\n\nGerado às ${timeStr}\n\n*Resumo da Varredura:*\n" + 
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
        // Disparar impressão automática na nova guia após carregamento básico
        win.onload = function() {
            setTimeout(() => { win.print(); }, 500);
        };
    } else {
        alert("O bloqueador de pop-ups impediu a geração do relatório. Por favor, permita pop-ups para este site.");
    }
}
