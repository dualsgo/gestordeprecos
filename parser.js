export async function processFile(file) {
    const text = await file.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/html');

    // Detect file type
    const headers = Array.from(doc.querySelectorAll('th')).map(th => th.textContent.trim());
    const isRelatorioCircular = headers.includes('Filial') && headers.includes('Evento');
    const isSemGiro = headers.includes('Data Última Venda') || text.includes('sem Giro') || text.includes('sem fornecedor');

    const results = {
        aumentos: [],
        entradasOferta: [],
        terminosOferta: [],
        rebaixas: [],
        semGiro: []
    };

    function parseNumber(str, isAmerican) {
        if (!str) return 0;
        if (isAmerican) {
            return parseFloat(str);
        } else {
            return parseFloat(str.replace(/\./g, '').replace(',', '.'));
        }
    }

    function parseEstoque(str) {
        if (!str) return '0';
        const num = parseFloat(str.replace(',', '.'));
        return isNaN(num) ? str : num.toString().replace('.', ',');
    }

    function parseEstoqueSemGiro(str) {
        if (!str) return '0';
        let val = str.replace(/\./g, '').replace(/,/g, '').trim();
        if (val.endsWith('000') && val !== '000') {
            val = val.slice(0, -3);
        } else if (val === '000') {
            val = '0';
        }
        return val || '0';
    }

    if (isSemGiro) {
        const rows = doc.querySelectorAll('tbody tr');
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 10) return;

            const codInt = cells[0].textContent.trim();
            if (codInt.toLowerCase().includes('interno') || codInt === '') return;

            const ean = cells[1].textContent.trim();
            const mercadoria = cells[2].textContent.trim();
            const fornecedorCod = cells[3] ? cells[3].textContent.trim() : '';
            const estoque = parseEstoqueSemGiro(cells[5].textContent.trim());
            const precoVenda = parseNumber(cells[8].textContent.trim(), false);
            const promocao = parseNumber(cells[9].textContent.trim(), false);

            const item = { 
                codInt, 
                mercadoria, 
                ean: ean || 'N/A', 
                fornecedor: 'SEM_FORNECEDOR', 
                fornecedorCod, 
                precoAnterior: precoVenda, 
                novoPreco: precoVenda, 
                promocao, 
                estoque 
            };
            results.semGiro.push(item);
        });
    } else if (isRelatorioCircular) {
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
            const estoque = parseEstoque(cells[12].textContent.trim()); 
            
            const fornecedor = `SEM_FORNECEDOR`;
            const fornecedorCodRef = cells[4].textContent.trim(); 
            
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
                if (headerText.includes('Cod. Interno') || headerText === '') return;

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
