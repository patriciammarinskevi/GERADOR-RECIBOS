/**
 * servidor-recibos.js
 *
 * Servidor principal da aplicação de geração de recibos.
 * - API CRUD para funcionários (SQLite/PostgreSQL via Knex).
 * - Geração de um arquivo ZIP com recibos em PDF via Puppeteer.
 * - Servir arquivos estáticos do frontend.
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');
const numeroPorExtenso = require('numero-por-extenso');
const archiver = require('archiver');

// --- CONFIGURAÇÃO DO KNEX / BANCO DE DADOS ---
const configuracaoKnexArquivo = require('./knexfile');
const ambienteAtual = process.env.NODE_ENV || 'development';
const configuracaoKnex = configuracaoKnexArquivo[ambienteAtual];
const bancoDeDados = require('knex')(configuracaoKnex);

// --- INICIALIZAÇÃO DO SERVIDOR ---
const aplicacao = express();
const porta = process.env.PORT || 3000;

// --- CONFIGURAÇÕES GLOBAIS DA EMPRESA ---
const DADOS_EMPRESA = {
    nome: "Aliança Consig",
    cnpj: "50.113.116/0001-05",
    cidade: "Brasília"
};

// --- MIDDLEWARE ---
// Serve arquivos estáticos do frontend (HTML, CSS, JS)
aplicacao.use(express.static('public'));
aplicacao.use(express.json());

// Define o caminho para a pasta de arquivos temporários
const diretorioTemporario = path.join(__dirname, 'temp_files');
aplicacao.use('/temp_files', express.static(diretorioTemporario));


// --- FUNÇÕES AUXILIARES ---

/**
 * Converte um arquivo de imagem para uma string Base64 (Data URI).
 */
function imagemParaBase64(caminhoArquivo) {
    try {
        const bitmap = fs.readFileSync(caminhoArquivo);
        const mimeType = path.extname(caminhoArquivo) === '.png' ? 'image/png' : 'image/jpeg';
        return `data:${mimeType};base64,` + Buffer.from(bitmap).toString('base64');
    } catch (error) {
        console.error(`Erro ao ler a imagem ${caminhoArquivo}:`, error);
        return ''; // Retorna string vazia se a imagem não for encontrada
    }
}

/**
 * Sanitiza uma string para uso em nome de arquivo.
 */
function sanitizarNomeArquivo(texto) {
    return texto
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9\-_. ]/g, '')
        .trim()
        .replace(/\s+/g, '_');
}

/**
 * Interpreta o período de entrada.
 */
// SUBSTITUA A FUNÇÃO ANTIGA POR ESTA

/**
 * Interpreta o período de entrada.
 */
function interpretarPeriodo(periodoEntrada) {
    if (!periodoEntrada || typeof periodoEntrada !== 'string') {
        return { mes: null, ano: null, textoFormatado: periodoEntrada, stringSanitizada: String(periodoEntrada).replace(/[^a-z0-9]/gi, '-') };
    }

    const textoOriginal = periodoEntrada.trim();
    const mesesPorNome = {
        'janeiro': 1, 'fevereiro': 2, 'março': 3, 'marco': 3, 'abril': 4,
        'maio': 5, 'junho': 6, 'julho': 7, 'agosto': 8, 'setembro': 9,
        'outubro': 10, 'novembro': 11, 'dezembro': 12
    };
    const abreviaturas = {
        'jan': 1, 'fev': 2, 'mar': 3, 'abr': 4, 'mai': 5, 'jun': 6, 'jul': 7, 'ago': 8, 'set': 9, 'out': 10, 'nov': 11, 'dez': 12
    };

    let partes = textoOriginal.split(/[\/\-\s]+/).filter(Boolean);
    let mesDetectado = NaN;
    let anoDetectado = NaN;

    if (partes.length >= 2) {
        const possivelMes = partes[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const possivelAno = partes[1];

        // Lógica para detectar o mês (igual a anterior)
        if (/^\d{1,2}$/.test(possivelMes)) {
            mesDetectado = parseInt(possivelMes, 10);
        } else if (mesesPorNome[possivelMes]) {
            mesDetectado = mesesPorNome[possivelMes];
        } else {
            const abre = possivelMes.substr(0, 3);
            if (abreviaturas[abre]) mesDetectado = abreviaturas[abre];
        }

        // ### CORREÇÃO: Lógica melhorada para detectar o ano ###
        if (/^\d{4}$/.test(possivelAno)) { // Checa se tem 4 dígitos (ex: 2025)
            anoDetectado = parseInt(possivelAno, 10);
        } else if (/^\d{2}$/.test(possivelAno)) { // Checa se tem 2 dígitos (ex: 25)
            anoDetectado = 2000 + parseInt(possivelAno, 10); // Converte para 2025
        }
    }

    if (!Number.isNaN(mesDetectado) && mesDetectado >= 1 && mesDetectado <= 12 && !Number.isNaN(anoDetectado)) {
        const ultimoDia = new Date(anoDetectado, mesDetectado, 0).getDate();
        const mesFormatado = String(mesDetectado).padStart(2, '0');
        const textoFormatado = `01/${mesFormatado}/${anoDetectado} a ${String(ultimoDia).padStart(2, '0')}/${mesFormatado}/${anoDetectado}`;
        const stringSanitizada = `${mesFormatado}-${anoDetectado}`;
        return { mes: mesDetectado, ano: anoDetectado, textoFormatado, stringSanitizada };
    }

    // Se não conseguir entender, retorna o texto original
    return { mes: null, ano: null, textoFormatado: textoOriginal, stringSanitizada: textoOriginal.replace(/[^a-z0-9]/gi, '-') };
}


// =============================================================
//               API CRUD PARA GERENCIAR FUNCIONÁRIOS
// =============================================================

aplicacao.get('/api/funcionarios', async (requisicao, resposta) => {
    try {
        const funcionarios = await bancoDeDados('funcionarios').select('*').orderBy('nome_completo');
        resposta.status(200).json(funcionarios);
    } catch (erro) {
        console.error('Erro ao buscar funcionários:', erro);
        resposta.status(500).json({ error: 'Erro interno ao buscar funcionários.' });
    }
});

aplicacao.post('/api/funcionarios', async (requisicao, resposta) => {
    try {
        const { nome_completo, cpf, salario_base } = requisicao.body;
        if (!nome_completo || !cpf || salario_base === undefined) {
            return resposta.status(400).json({ error: 'Todos os campos são obrigatórios.' });
        }
        const [novoFuncionario] = await bancoDeDados('funcionarios').insert({ nome_completo, cpf, salario_base }).returning('*');
        resposta.status(201).json(novoFuncionario);
    } catch (erro) {
        if (erro.code === '23505' || erro.code === 'SQLITE_CONSTRAINT') {
            return resposta.status(409).json({ error: 'Este CPF já está cadastrado.' });
        }
        console.error('Erro ao adicionar funcionário:', erro);
        resposta.status(500).json({ error: 'Erro interno ao adicionar funcionário.' });
    }
});

aplicacao.put('/api/funcionarios/:id', async (requisicao, resposta) => {
    try {
        const { id } = requisicao.params;
        const { nome_completo, cpf, salario_base } = requisicao.body;
        const quantidadeAtualizada = await bancoDeDados('funcionarios').where({ id }).update({ nome_completo, cpf, salario_base });
        if (quantidadeAtualizada === 0) {
            return resposta.status(404).json({ error: 'Funcionário não encontrado.' });
        }
        const funcionarioAtualizado = await bancoDeDados('funcionarios').where({ id }).first();
        resposta.status(200).json(funcionarioAtualizado);
    } catch (erro) {
        console.error('Erro ao atualizar funcionário:', erro);
        resposta.status(500).json({ error: 'Erro interno ao atualizar funcionário.' });
    }
});

aplicacao.delete('/api/funcionarios/:id', async (requisicao, resposta) => {
    try {
        const { id } = requisicao.params;
        const quantidadeRemovida = await bancoDeDados('funcionarios').where({ id }).del();
        if (quantidadeRemovida === 0) {
            return resposta.status(404).json({ error: 'Funcionário não encontrado.' });
        }
        resposta.status(204).send();
    } catch (erro) {
        console.error('Erro ao deletar funcionário:', erro);
        resposta.status(500).json({ error: 'Erro interno ao deletar funcionário.' });
    }
});


// =============================================================
//              ROTA PARA GERAR O ARQUIVO ZIP COM RECIBOS
// =============================================================
aplicacao.post('/gerar-recibos', async (requisicao, resposta) => {
    const { periodo } = requisicao.body;
    if (!periodo) {
        return resposta.status(400).json({ error: 'O período de referência é obrigatório.' });
    }

    let navegador;
    try {
        // ### CORREÇÃO DE LÓGICA: Limpa e recria a pasta temporária no início
        if (fs.existsSync(diretorioTemporario)) {
            fs.rmSync(diretorioTemporario, { recursive: true, force: true });
        }
        fs.mkdirSync(diretorioTemporario, { recursive: true });

        const listaFuncionarios = await bancoDeDados('funcionarios').select('*');
        if (!listaFuncionarios || listaFuncionarios.length === 0) {
            return resposta.status(404).json({ error: 'Nenhum funcionário cadastrado para gerar recibos.' });
        }

        const arquivoTemplate = fs.readFileSync(path.join(__dirname, 'views', 'recibo-template.html'), 'utf-8');
        const logoEmpresaBase64 = imagemParaBase64(path.join(__dirname, 'public', 'images', 'logo-empresa.jpg'));
        const logoAliancaBase64 = imagemParaBase64(path.join(__dirname, 'public', 'images', 'logo-alianca.png'));

        const resultadoPeriodo = interpretarPeriodo(String(periodo));
        const periodoSanitizadoParaArquivo = resultadoPeriodo.stringSanitizada;

        const nomeArquivoZip = `Recibos_${periodoSanitizadoParaArquivo}.zip`;
        const caminhoArquivoZip = path.join(diretorioTemporario, nomeArquivoZip);
        const output = fs.createWriteStream(caminhoArquivoZip);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => {
            console.log(`Arquivo ZIP criado: ${archive.pointer()} bytes totais.`);
            resposta.status(200).json({
                message: 'Recibos gerados e compactados com sucesso.',
                file: nomeArquivoZip
            });
        });

        archive.on('error', err => { throw err; });
        archive.pipe(output);

        navegador = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });

        for (const funcionario of listaFuncionarios) {
            const valorNumerico = parseFloat(String(funcionario.salario_base).replace(',', '.')) || 0;
            const valorFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorNumerico);
            const valorPorExtenso = numeroPorExtenso.porExtenso(valorNumerico, 'monetario').toUpperCase();
            const dataAtualFormatada = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

            const conteudoHtml = arquivoTemplate
                .replace(/{{LOGO_EMPRESA}}/g, logoEmpresaBase64)
                .replace(/{{LOGO_ALIANCA}}/g, logoAliancaBase64)
                .replace(/{{NOME}}/g, funcionario.nome_completo)
                .replace(/{{CPF}}/g, funcionario.cpf)
                .replace(/{{VALOR_FORMATADO}}/g, valorFormatado)
                .replace(/{{VALOR_POR_EXTENSO}}/g, valorPorExtenso)
                .replace(/{{PERIODO}}/g, resultadoPeriodo.textoFormatado)
                .replace(/{{DATA_ATUAL}}/g, dataAtualFormatada)
                .replace(/{{EMPRESA_NOME}}/g, DADOS_EMPRESA.nome)
                .replace(/{{EMPRESA_CNPJ}}/g, DADOS_EMPRESA.cnpj)
                .replace(/{{CIDADE}}/g, DADOS_EMPRESA.cidade);

            const nomeArquivoPdf = `RECIBO-${sanitizarNomeArquivo(funcionario.nome_completo)}-${periodoSanitizadoParaArquivo}.pdf`;
            const caminhoPdfTemporario = path.join(diretorioTemporario, nomeArquivoPdf);

            const pagina = await navegador.newPage();
            await pagina.setContent(conteudoHtml, { waitUntil: 'domcontentloaded' });
            await pagina.pdf({ path: caminhoPdfTemporario, format: 'A4', printBackground: true });

            archive.append(fs.createReadStream(caminhoPdfTemporario), { name: nomeArquivoPdf });

            await pagina.close();
        }

        await navegador.close();
        await archive.finalize();

    } catch (erro) {
        console.error('Erro ao gerar recibos:', erro);
        // Garante que o navegador seja fechado em caso de erro
        if (navegador) {
            await navegador.close();
        }
        resposta.status(500).json({ error: 'Falha interna ao gerar os recibos.' });
    }
});


// =============================================================
//               INICIA O SERVIDOR EXPRESS
// =============================================================
aplicacao.listen(porta, () => {
    console.log(`🚀 Servidor rodando na porta ${porta}`);
});