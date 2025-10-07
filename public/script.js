document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTOS DO DOM ---
    const employeeForm = document.getElementById('employee-form');
    const generateForm = document.getElementById('generate-form');
    const employeeTableBody = document.getElementById('employee-table-body');
    const employeeIdInput = document.getElementById('employee-id');
    const cancelBtn = document.getElementById('cancel-btn');
    const statusMessage = document.getElementById('status-message');
    let isEditing = false;

    // --- FUNÇÕES DA API ---

    // 1. Buscar todos os funcionários e renderizar na tabela
    const fetchAndRenderEmployees = async () => {
        try {
            const response = await fetch('/api/funcionarios');
            const employees = await response.json();
            
            employeeTableBody.innerHTML = ''; // Limpa a tabela
            if (employees.length === 0) {
                employeeTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhum funcionário cadastrado.</td></tr>';
            } else {
                employees.forEach(emp => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${emp.nome_completo}</td>
                        <td>${emp.cpf}</td>
                        <td>${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(emp.salario_base)}</td>
                        <td class="actions">
                            <button class="secondary-btn" data-action="edit" data-id="${emp.id}">Editar</button>
                            <button class="danger-btn" data-action="delete" data-id="${emp.id}">Excluir</button>
                        </td>
                    `;
                    employeeTableBody.appendChild(row);
                });
            }
        } catch (error) {
            console.error('Erro ao buscar funcionários:', error);
            statusMessage.textContent = 'Falha ao carregar funcionários.';
        }
    };

    // 2. Salvar (Criar ou Atualizar) um funcionário
    const saveEmployee = async (employeeData) => {
        const url = isEditing ? `/api/funcionarios/${employeeIdInput.value}` : '/api/funcionarios';
        const method = isEditing ? 'PUT' : 'POST';

        try {
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(employeeData),
            });
            if (!response.ok) throw new Error('Falha ao salvar funcionário.');
            resetForm();
            await fetchAndRenderEmployees(); // Atualiza a tabela
            statusMessage.textContent = `Funcionário ${isEditing ? 'atualizado' : 'salvo'} com sucesso!`;
        } catch (error) {
            console.error('Erro ao salvar funcionário:', error);
            statusMessage.textContent = 'Erro ao salvar funcionário.';
        }
    };

    // 3. Deletar um funcionário
    const deleteEmployee = async (id) => {
        if (!confirm('Tem certeza que deseja excluir este funcionário?')) return;
        try {
            const response = await fetch(`/api/funcionarios/${id}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Falha ao deletar funcionário.');
            await fetchAndRenderEmployees(); // Atualiza a tabela
            statusMessage.textContent = 'Funcionário excluído com sucesso!';
        } catch (error) {
            console.error('Erro ao deletar funcionário:', error);
            statusMessage.textContent = 'Erro ao excluir funcionário.';
        }
    };

    // --- FUNÇÕES AUXILIARES DO FORMULÁRIO ---

    const resetForm = () => {
        employeeForm.reset();
        employeeIdInput.value = '';
        isEditing = false;
        cancelBtn.style.display = 'none';
        document.querySelector('#save-btn').textContent = 'Salvar Funcionário';
    };

    const populateFormForEdit = async (id) => {
        try {
            const response = await fetch('/api/funcionarios');
            const employees = await response.json();
            const employeeToEdit = employees.find(emp => emp.id == id);
            
            if (employeeToEdit) {
                document.getElementById('nome_completo').value = employeeToEdit.nome_completo;
                document.getElementById('cpf').value = employeeToEdit.cpf;
                document.getElementById('salario_base').value = employeeToEdit.salario_base;
                employeeIdInput.value = employeeToEdit.id;
                isEditing = true;
                cancelBtn.style.display = 'inline-block';
                document.querySelector('#save-btn').textContent = 'Atualizar Funcionário';
                window.scrollTo(0, 0); // Rola para o topo para ver o formulário
            }
        } catch (error) {
            console.error('Erro ao buscar dados para edição:', error);
        }
    };

    // --- EVENT LISTENERS ---

    // Salvar/Atualizar
    employeeForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const employeeData = {
            nome_completo: document.getElementById('nome_completo').value,
            cpf: document.getElementById('cpf').value,
            salario_base: parseFloat(document.getElementById('salario_base').value),
        };
        saveEmployee(employeeData);
    });

    // Clicar em "Editar" ou "Excluir" na tabela
    employeeTableBody.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        const id = e.target.dataset.id;
        if (action === 'edit') {
            populateFormForEdit(id);
        } else if (action === 'delete') {
            deleteEmployee(id);
        }
    });

    // =============================================================
    //           LÓGICA DE GERAÇÃO DE RECIBOS MODIFICADA
    // =============================================================
    generateForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const generateBtn = document.getElementById('generate-btn');
        generateBtn.disabled = true;
        statusMessage.textContent = 'Gerando recibos, por favor aguarde...';
        
        try {
            const periodo = document.getElementById('periodo').value;
            const response = await fetch('/gerar-recibos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ periodo }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Falha na geração dos recibos.');
            }

            statusMessage.textContent = 'Iniciando downloads... Por favor, verifique sua pasta de downloads.';

            // Função auxiliar para baixar um arquivo
            const downloadFile = (fileName) => {
                const a = document.createElement('a');
                // O servidor está servindo os arquivos da pasta 'temp_pdfs'
                a.href = `/temp_pdfs/${fileName}`; 
                a.download = fileName; // O nome que o arquivo terá no computador do usuário
                document.body.appendChild(a);
                a.click();
                a.remove();
            };
            
            // Itera sobre a lista de arquivos recebida e inicia o download de cada um
            data.files.forEach((file, index) => {
                // Adiciona um pequeno atraso entre os downloads para evitar que o navegador bloqueie
                setTimeout(() => {
                    downloadFile(file);
                }, index * 1000); // 1 segundo de intervalo
            });
            
            setTimeout(() => {
                 statusMessage.textContent = `${data.files.length} recibos foram baixados com sucesso!`;
            }, data.files.length * 1000);


        } catch (error) {
            console.error('Erro ao gerar recibos:', error);
            statusMessage.textContent = `Erro: ${error.message}`;
        } finally {
            generateBtn.disabled = false;
        }
    });


    // Cancelar edição
    cancelBtn.addEventListener('click', resetForm);

    // --- INICIALIZAÇÃO ---
    fetchAndRenderEmployees();
});