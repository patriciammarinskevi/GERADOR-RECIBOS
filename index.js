/**
 * servidor-recibos.js
 *
 * Servidor principal da aplicação de geração de recibos.
 * - API CRUD para funcionários (SQLite via Knex).
 * - Geração de recibos em PDF via Puppeteer.
 * - Servir arquivos estáticos do frontend.
 *
 * Observações:
 * - O campo `periodo` do POST para /gerar-recibos aceita formatos como:
 *   "09/2025", "9/2025", "setembro/2025", "set/2025", "out/2025", "Outubro/2025".
 * - O recibo inclui o trecho no formato: "MM/YYYY (01/MM a DD/MM)".
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');
const numeroPorExtenso = require('numero-por-extenso');

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
aplicacao.use(express.static('public'));
aplicacao.use(express.json());

const diretorioTemporario = path.join(__dirname, 'temp_pdfs');
aplicacao.use('/temp_pdfs', express.static(diretorioTemporario));

// --- FUNÇÕES AUXILIARES ---

/**
 * Sanitiza uma string para uso em nome de arquivo.
 * Remove acentos, caracteres especiais e substitui espaços por underscore.
 */
function sanitizarNomeArquivo(texto) {
    return texto
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
        .replace(/[^a-zA-Z0-9\-_. ]/g, '') // remove chars especiais
        .trim()
        .replace(/\s+/g, '_');
}

/**
 * Faz o parse do campo `periodo` e retorna um objeto com:
 * - mes (1..12) ou null
 * - ano ou null
 * - textoFormatado (ex: "09/2025 (01/09 a 30/09)" ou fallback para entrada original)
 * - stringSanitizada para usar em nome de arquivo (ex: "09-2025")
 */
function interpretarPeriodo(periodoEntrada) {
    if (!periodoEntrada || typeof periodoEntrada !== 'string') {
        return { mes: null, ano: null, textoFormatado: periodoEntrada, stringSanitizada: periodoEntrada.replace(/[^a-z0-9]/gi, '-') };
    }

    const texto = periodoEntrada.trim();

    // Mapas de meses por extenso e abreviações (português)
    const mesesPorNome = {
        'janeiro': 1, 'fevereiro': 2, 'março': 3, 'marco': 3, 'abril': 4,
        'maio': 5, 'junho': 6, 'julho': 7, 'agosto': 8, 'setembro': 9,
        'outubro': 10, 'novembro': 11, 'dezembro': 12
    };
    const abreviaturas = {
        'jan':1,'fev':2,'mar':3,'abr':4,'mai':5,'jun':6,'jul':7,'ago':8,'set':9,'out':10,'nov':11,'dez':12
    };

    // Tenta separar por "/" ou "-" ou espaço
    let partes = texto.split(/[\/\-\s]+/).filter(Boolean);

    let mesDetectado = NaN;
    let anoDetectado = NaN;

    if (partes.length >= 2) {
        const possivelMes = partes[0].toLowerCase();
        const possivelAno = partes[1];

        // se for número (09 ou 9)
        if (/^\d{1,2}$/.test(possivelMes)) {
            mesDetectado = parseInt(possivelMes, 10);
        } else {
            // remove acento e pega as 3 primeiras letras para tentar mapear
            const semAcento = possivelMes.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            if (mesesPorNome[semAcento]) {
                mesDetectado = mesesPorNome[semAcento];
            } else {
                const abre = semAcento.substr(0,3);
                if (abreviaturas[abre]) mesDetectado = abreviaturas[abre];
            }
        }

        if (/^\d{4}$/.test(possivelAno)) {
            anoDetectado = parseInt(possivelAno, 10);
        }
    } else {
        // tenta casar com formato "setembro2025" ou "setembro-2025" já tratados antes,
        // mas se nada funcionar, fallback abaixo
    }

    // Se mes/ano válidos, monta texto formatado
    if (!Number.isNaN(mesDetectado) && mesDetectado >= 1 && mesDetectado <= 12 && !Number.isNaN(anoDetectado)) {
        // último dia do mês
        const ultimoDia = new Date(anoDetectado, mesDetectado, 0).getDate(); // mesDetectado usado diretamente
        const mesFormatado = String(mesDetectado).padStart(2, '0');
        const dataInicio = `01/${mesFormatado}`;
        const dataFim = `${String(ultimoDia).padStart(2, '0')}/${mesFormatado}`;
        const textoFormatado = `${mesFormatado}/${anoDetectado} (${dataInicio} a ${dataFim})`;
        const stringSanitizada = `${mesFormatado}-${anoDetectado}`;
        return { mes: mesDetectado, ano: anoDetectado, textoFormatado, stringSanitizada };
    }

    // fallback: não conseguiu interpretar, retorna versão sanitizada do input
    return {
        mes: null,
        ano: null,
        textoFormatado: texto,
        stringSanitizada: texto.replace(/[^a-z0-9]/gi, '-')
    };
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
        if (!nome_completo || !cpf || !salario_base) {
            return resposta.status(400).json({ error: 'Todos os campos são obrigatórios.' });
        }
        const [idInserido] = await bancoDeDados('funcionarios').insert({ nome_completo, cpf, salario_base });
        const novoFuncionario = await bancoDeDados('funcionarios').where({ id: idInserido }).first();
        resposta.status(201).json(novoFuncionario);
    } catch (erro) {
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
//         ROTA PARA GERAR E LISTAR RECIBOS (PDF)
// =============================================================

aplicacao.post('/gerar-recibos', async (requisicao, resposta) => {
    const { periodo } = requisicao.body;
    if (!periodo) {
        return resposta.status(400).json({ error: 'O período de referência é obrigatório.' });
    }

    // recria diretório temporário (limpa o antigo)
    if (fs.existsSync(diretorioTemporario)) {
        fs.rmSync(diretorioTemporario, { recursive: true, force: true });
    }
    fs.mkdirSync(diretorioTemporario, { recursive: true });

    try {
        const listaFuncionarios = await bancoDeDados('funcionarios').select('*');
        if (!listaFuncionarios || listaFuncionarios.length === 0) {
            return resposta.status(404).json({ error: 'Nenhum funcionário encontrado.' });
        }

        const arquivoTemplate = fs.readFileSync(path.join(__dirname, 'views', 'recibo-template.html'), 'utf-8');

        // interpreta o periodo e produz "MM/YYYY (01/MM a DD/MM)" quando possível
        const resultadoPeriodo = interpretarPeriodo(String(periodo));
        const periodoCompleto = resultadoPeriodo.textoFormatado;
        const periodoSanitizadoParaArquivo = resultadoPeriodo.stringSanitizada.replace(/[^a-z0-9\-]/gi, '-');

        const nomesArquivosGerados = [];

        // abre o navegador puppeteer
        const navegador = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        try {
            for (const funcionario of listaFuncionarios) {
                const nomeCompleto = funcionario.nome_completo || '';
                const cpf = funcionario.cpf || '';
                const salarioBase = funcionario.salario_base || '0';

                const valorNumerico = parseFloat(String(salarioBase).replace(',', '.')) || 0;
                const valorFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorNumerico);

                // tentativa robusta para por extenso, com fallback
                let valorPorExtenso = '';
                try {
                    // primeira tentativa: API clássica com string 'monetario'
                    valorPorExtenso = numeroPorExtenso.porExtenso(valorNumerico, 'monetario').toUpperCase();
                } catch (erroExtenso1) {
                    try {
                        // segunda tentativa: sem segundo argumento
                        valorPorExtenso = numeroPorExtenso.porExtenso(valorNumerico).toUpperCase();
                    } catch (erroExtenso2) {
                        // fallback simples
                        valorPorExtenso = '';
                        console.warn('Falha ao converter valor por extenso para', nomeCompleto, erroExtenso2);
                    }
                }

                const dataAtualFormatada = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

                // substitui placeholders no template
                const conteudoHtml = arquivoTemplate
                    .replace(/{{NOME}}/g, nomeCompleto)
                    .replace(/{{CPF}}/g, cpf)
                    .replace(/{{VALOR_FORMATADO}}/g, valorFormatado)
                    .replace(/{{VALOR_POR_EXTENSO}}/g, valorPorExtenso)
                    .replace(/{{PERIODO}}/g, periodoCompleto)
                    .replace(/{{DATA_ATUAL}}/g, dataAtualFormatada)
                    .replace(/{{EMPRESA_NOME}}/g, DADOS_EMPRESA.nome)
                    .replace(/{{EMPRESA_CNPJ}}/g, DADOS_EMPRESA.cnpj)
                    .replace(/{{CIDADE}}/g, DADOS_EMPRESA.cidade);

                const pagina = await navegador.newPage();
                await pagina.setContent(conteudoHtml, { waitUntil: 'networkidle0' });

                // nome do arquivo: RECIBO-PAGAMENTO-NOME_COMPLETO-MES-ANO.pdf
                const nomeParaArquivo = sanitizarNomeArquivo(nomeCompleto);
                const nomeArquivoPdf = `RECIBO-PAGAMENTO-${nomeParaArquivo}-${periodoSanitizadoParaArquivo}.pdf`;
                const caminhoPdf = path.join(diretorioTemporario, nomeArquivoPdf);

                await pagina.pdf({ path: caminhoPdf, format: 'A4', printBackground: true });
                nomesArquivosGerados.push(nomeArquivoPdf);

                await pagina.close();
            }
        } finally {
            await navegador.close();
        }

        return resposta.status(200).json({
            message: 'Recibos gerados com sucesso.',
            files: nomesArquivosGerados,
            periodo: periodoSanitizadoParaArquivo
        });

    } catch (erro) {
        console.error('Erro ao gerar PDFs:', erro);
        return resposta.status(500).json({ error: 'Falha ao gerar os recibos.' });
    }
});

// --- INICIALIZAÇÃO DO SERVIDOR ---
aplicacao.listen(porta, () => {
    console.log(`Servidor rodando em http://localhost:${porta} - ${new Date().toLocaleDateString('pt-BR')}`);
});
