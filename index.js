/**
 * @file Servidor principal da aplicação de geração de recibos.
 * @description Este arquivo configura um servidor Express com as seguintes funcionalidades:
 * 1. Uma API RESTful (CRUD) para gerenciar funcionários em um banco de dados SQLite.
 * 2. Uma rota para gerar recibos em PDF para todos os funcionários cadastrados.
 * 3. Servir os arquivos estáticos do frontend (HTML, CSS, JS).
 */

// --- IMPORTAÇÃO DAS DEPENDÊNCIAS ---
const express = require('express');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');
const extenso = require('numero-por-extenso');

// --- CONFIGURAÇÃO DO BANCO DE DADOS (KNEX) --- //
// ########## INÍCIO DA CORREÇÃO ##########
const knexConfig = require('./knexfile');
// Define o ambiente com base na variável NODE_ENV, ou usa 'development' como padrão
const environment = process.env.NODE_ENV || 'development';
// Seleciona a configuração correta do knexfile.js
const configuration = knexConfig[environment];
// Inicializa o knex com a configuração dinâmica
const knex = require('knex')(configuration);
// ########## FIM DA CORREÇÃO ##########


// --- INICIALIZAÇÃO DO SERVIDOR EXPRESS ---
const app = express();
const PORT = process.env.PORT || 3000; // Já estava correto

// --- CONFIGURAÇÕES GLOBAIS DA EMPRESA ---
const DADOS_EMPRESA = {
    nome: "Aliança Consig",
    cnpj: "50.113.116/0001-05",
    cidade: "Brasília"
};

// --- MIDDLEWARE ---
app.use(express.static('public'));
app.use(express.json());

const tempDir = path.join(__dirname, 'temp_pdfs');
app.use('/temp_pdfs', express.static(tempDir));


// =============================================================
//               API CRUD PARA GERENCIAR FUNCIONÁRIOS
// =============================================================

app.get('/api/funcionarios', async (request, response) => {
    try {
        const funcionarios = await knex('funcionarios').select('*').orderBy('nome_completo');
        response.status(200).json(funcionarios);
    } catch (error) {
        console.error('Erro detalhado ao buscar funcionários:', error);
        response.status(500).json({ error: 'Erro interno ao buscar funcionários.' });
    }
});

app.post('/api/funcionarios', async (request, response) => {
    try {
        const { nome_completo, cpf, salario_base } = request.body;
        if (!nome_completo || !cpf || !salario_base) {
            return response.status(400).json({ error: 'Todos os campos são obrigatórios.' });
        }
        const [id] = await knex('funcionarios').insert({ nome_completo, cpf, salario_base });
        const novoFuncionario = await knex('funcionarios').where({ id }).first();
        response.status(201).json(novoFuncionario);
    } catch (error) {
        console.error('Erro detalhado ao adicionar funcionário:', error);
        response.status(500).json({ error: 'Erro interno ao adicionar funcionário.' });
    }
});

app.put('/api/funcionarios/:id', async (request, response) => {
    try {
        const { id } = request.params;
        const { nome_completo, cpf, salario_base } = request.body;
        const count = await knex('funcionarios').where({ id }).update({ nome_completo, cpf, salario_base });

        if (count === 0) {
            return response.status(404).json({ error: 'Funcionário não encontrado.' });
        }
        const funcionarioAtualizado = await knex('funcionarios').where({ id }).first();
        response.status(200).json(funcionarioAtualizado);
    } catch (error) {
        console.error('Erro detalhado ao atualizar funcionário:', error);
        response.status(500).json({ error: 'Erro interno ao atualizar funcionário.' });
    }
});

app.delete('/api/funcionarios/:id', async (request, response) => {
    try {
        const { id } = request.params;
        const count = await knex('funcionarios').where({ id }).del();
        if (count === 0) {
            return response.status(404).json({ error: 'Funcionário não encontrado.' });
        }
        response.status(204).send();
    } catch (error) {
        console.error('Erro detalhado ao deletar funcionário:', error);
        response.status(500).json({ error: 'Erro interno ao deletar funcionário.' });
    }
});

// =============================================================
//         ROTA MODIFICADA PARA GERAR E LISTAR RECIBOS
// =============================================================

app.post('/gerar-recibos', async (request, response) => {
    const { periodo } = request.body;
    if (!periodo) {
        return response.status(400).json({ error: 'O período de referência é obrigatório.' });
    }

    if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });

    try {
        const funcionariosDoBanco = await knex('funcionarios').select('*');
        if (!funcionariosDoBanco || funcionariosDoBanco.length === 0) {
            return response.status(404).json({ error: 'Nenhum funcionário encontrado.' });
        }

        const pdfFileNames = [];
        const templateHtml = fs.readFileSync(path.join(__dirname, 'views', 'recibo-template.html'), 'utf-8');
        const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });

        const periodoSanitizado = periodo.replace(/[^a-z0-9]/gi, '-');

        const meses = {
            'janeiro': 0, 'fevereiro': 1, 'março': 2, 'abril': 3, 'maio': 4, 'junho': 5,
            'julho': 6, 'agosto': 7, 'setembro': 8, 'outubro': 9, 'novembro': 10, 'dezembro': 11
        };
        const [mesStr, anoStr] = periodo.split('/');
        const mesNumero = meses[mesStr.toLowerCase().trim()];
        const ano = parseInt(anoStr, 10);

        let diasTrabalhadosStr = '';
        if (mesNumero !== undefined && !isNaN(ano)) {
            const ultimoDia = new Date(ano, mesNumero + 1, 0).getDate();
            const mesFormatado = String(mesNumero + 1).padStart(2, '0');
            diasTrabalhadosStr = `(${String(1).padStart(2, '0')}/${mesFormatado} a ${ultimoDia}/${mesFormatado})`;
        }

        for (const funcionario of funcionariosDoBanco) {
            const { nome_completo, cpf, salario_base } = funcionario;
            const valorNumerico = parseFloat(salario_base);
            const valorFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorNumerico);
            const valorPorExtenso = extenso.porExtenso(valorNumerico, 'monetario').toUpperCase();
            const dataAtual = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

            let htmlContent = templateHtml
                .replace(/{{NOME}}/g, nome_completo)
                .replace(/{{CPF}}/g, cpf)
                .replace(/{{VALOR_FORMATADO}}/g, valorFormatado)
                .replace(/{{VALOR_POR_EXTENSO}}/g, valorPorExtenso)
                .replace(/{{PERIODO}}/g, periodo)
                .replace(/{{DATA_ATUAL}}/g, dataAtual)
                .replace(/{{EMPRESA_NOME}}/g, DADOS_EMPRESA.nome)
                .replace(/{{EMPRESA_CNPJ}}/g, DADOS_EMPRESA.cnpj)
                .replace(/{{CIDADE}}/g, DADOS_EMPRESA.cidade)
                .replace(/{{DIAS_TRABALHADOS}}/g, diasTrabalhadosStr);

            const page = await browser.newPage();
            await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
            
            const fileName = `RECIBO-PAGAMENTO-${nome_completo.replace(/\s+/g, '_')}-${periodoSanitizado}.pdf`;
            const pdfPath = path.join(tempDir, fileName);
            
            await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });
            pdfFileNames.push(fileName);
            await page.close();
        }

        await browser.close();

        response.status(200).json({
            message: 'Recibos gerados com sucesso.',
            files: pdfFileNames,
            periodo: periodoSanitizado
        });

    } catch (error) {
        console.error('Erro ao gerar PDFs:', error);
        response.status(500).json({ error: 'Falha ao gerar os recibos.' });
    }
});

// --- INICIALIZAÇÃO DO SERVIDOR ---
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT} em ${new Date().toLocaleDateString('pt-BR')} `);
});
// --- FIM DO ARQUIVO ---