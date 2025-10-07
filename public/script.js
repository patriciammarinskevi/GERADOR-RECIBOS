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

    const fetchAndRenderEmployees = async () => {
        try {
            const response = await fetch('/api/funcionarios');
            if (!response.ok) throw new Error('Falha ao buscar funcionários.');
            const employees = await response.json();
            
            employeeTableBody.innerHTML = '';
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

    const saveEmployee = async (employeeData) => {
        const url = isEditing ? `/api/funcionarios/${employeeIdInput.value}` : '/api/funcionarios';
        const method = isEditing ? 'PUT' : 'POST';

        try {
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(employeeData),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Falha ao salvar funcionário.');
            
            resetForm();
            await fetchAndRenderEmployees();
            statusMessage.textContent = `Funcionário ${isEditing ? 'atualizado' : 'salvo'} com sucesso!`;
        } catch (error) {
            console.error('Erro ao salvar funcionário:', error);
            statusMessage.textContent = `Erro: ${error.message}`;
        }
    };

    const deleteEmployee = async (id) => {
        if (!confirm('Tem certeza que deseja excluir este funcionário?')) return;
        try {
            const response = await fetch(`/api/funcionarios/${id}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Falha ao deletar funcionário.');
            await fetchAndRenderEmployees();
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
            const response = await fetch(`/api/funcionarios`);
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
                window.scrollTo(0, 0);
            }
        } catch (error) {
            console.error('Erro ao buscar dados para edição:', error);
        }
    };

    // --- EVENT LISTENERS ---

    employeeForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const employeeData = {
            nome_completo: document.getElementById('nome_completo').value,
            cpf: document.getElementById('cpf').value,
            salario_base: parseFloat(document.getElementById('salario_base').value),
        };
        saveEmployee(employeeData);
    });

    employeeTableBody.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        const id = e.target.dataset.id;
        if (action === 'edit') populateFormForEdit(id);
        else if (action === 'delete') deleteEmployee(id);
    });

    // ### MELHORIA 1: LÓGICA DE GERAÇÃO DE RECIBOS MODIFICADA PARA ARQUIVO ZIP ###
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
            
            statusMessage.textContent = 'Geração concluída! Iniciando download do arquivo ZIP...';
            
            // Inicia o download do arquivo ZIP
            const a = document.createElement('a');
            a.href = `/temp_files/${data.file}`; 
            a.download = data.file;
            document.body.appendChild(a);
            a.click();
            a.remove();
            
            setTimeout(() => {
                 statusMessage.textContent = `Arquivo ${data.file} baixado com sucesso!`;
            }, 2000);

        } catch (error) {
            console.error('Erro ao gerar recibos:', error);
            statusMessage.textContent = `Erro: ${error.message}`;
        } finally {
            generateBtn.disabled = false;
        }
    });

    cancelBtn.addEventListener('click', resetForm);

    fetchAndRenderEmployees();
});