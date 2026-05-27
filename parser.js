export async function processFile(file) {
    const text = await file.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/html');

    // Detect file type
    const headers = Array.from(doc.querySelectorAll('th')).map(th => th.textContent.trim());
    const isRelatorioCircular = headers.includes('Filial') && headers.includes('Evento');

    const results = {
        aumentos: [],
        entradasOferta: [],
        terminosOferta: [],
        rebaixas: []
    };

    function parseNumber(str, isAmerican) {
        if (!str) return 0;
        if (isAmerican) {
            // "59.99" -> 59.99
            return parseFloat(str);
        } else {
            // "119,95" -> 119.95, "1.000,50" -> 1000.50
            return parseFloat(str.replace(/\./g, '').replace(',', '.'));
        }
    }

    function parseEstoque(str) {
        if (!str) return '0';
        // The system exports 24 as 24.000 or 15,000 (3 decimal places).
        // By replacing , with . and parsing as float, we get 24 and 15 natively.
        const num = parseFloat(str.replace(',', '.'));
        return isNaN(num) ? str : num.toString().replace('.', ',');
    }

    if (isRelatorioCircular) {
        // RelatorioCircularAlteracaoPreco.xls
        const rows = doc.querySelectorAll('tbody tr');
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 13) return;
            
            const codInt = cells[2].textContent.trim();
            const ean = cells[3].textContent.trim();
            const fornecedorCod = cells[4].textContent.trim();
            const mercadoria = cells[5].textContent.trim();
            const evento = cells[6].textContent.trim().toUpperCase();
            const precoAnterior = parseNumber(cells[7].textContent.trim(), true);
            const novoPreco = parseNumber(cells[8].textContent.trim(), true);
            const promocao = parseNumber(cells[9].textContent.trim(), true);
            const estoque = parseEstoque(cells[12].textContent.trim()); // Fix: "24.000" becomes "24"
            
            // O relatório circular não tem Fornecedor, então não agrupamos.
            const fornecedor = `SEM_FORNECEDOR`;
            const fornecedorCodRef = cells[4].textContent.trim(); // Mantém como Referência, não como Fornecedor!
            
            const item = { codInt, mercadoria, ean, fornecedor, fornecedorCod: fornecedorCodRef, precoAnterior, novoPreco, promocao, estoque };

            if (promocao > 0) {
                results.entradasOferta.push(item);
            } else if (evento.includes('AUMENTO') || novoPreco > precoAnterior) {
                results.aumentos.push(item);
            } else if (novoPreco < precoAnterior && promocao === 0) {
                results.rebaixas.push(item);
            } else {
                if (evento.includes('TERMINO') || evento.includes('TÉRMINO')) {
                    results.terminosOferta.push(item);
                } else {
                    results.aumentos.push(item); 
                }
            }
        });
    } else {
        // relatorio.xls
        const rows = doc.querySelectorAll('tbody tr');
        let currentFornecedor = "Desconhecido";

        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            
            if (cells.length === 1 && cells[0].hasAttribute('colspan')) {
                const strong = cells[0].querySelector('strong');
                if (strong) {
                    currentFornecedor = strong.textContent.replace(/\d+$/, '').trim().replace('Fornecedor:', '').trim();
                }
                return;
            }

            if (cells.length >= 7) {
                const headerText = cells[0].textContent.trim();
                if (headerText.includes('Cod. Interno') || headerText === '') return; // Skip subheaders

                const codInt = cells[0].textContent.trim();
                const mercadoria = cells[1].textContent.trim();
                const fornecedorCod = cells[2].textContent.trim();
                const estoque = parseEstoque(cells[3].textContent.trim());
                const precoAtual = parseNumber(cells[4].textContent.trim(), false);
                const novoPreco = parseNumber(cells[5].textContent.trim(), false);
                const promocao = parseNumber(cells[6].textContent.trim(), false);
                
                const item = { codInt, mercadoria, ean: 'N/A', fornecedor: currentFornecedor, fornecedorCod, precoAnterior: precoAtual, novoPreco, promocao, estoque };

                if (promocao > 0) {
                    results.entradasOferta.push(item);
                } else if (novoPreco > precoAtual) {
                    results.aumentos.push(item);
                } else if (novoPreco < precoAtual && promocao === 0) {
                    results.rebaixas.push(item);
                } else if (promocao === 0) {
                    results.terminosOferta.push(item);
                }
            }
        });
    }

    return results;
}
