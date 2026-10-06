import { useEffect, useState, useMemo } from 'react';
import { Table, Input, Button, Modal, Form, Select, Tag, Typography, Space, message, Tooltip, Popconfirm } from 'antd';
import { Icon } from '@iconify/react';
import { listarUsuarios, crearUsuario, actualizarUsuario, eliminarUsuario } from '../api/client';

const { Title, Text } = Typography;

function PanelUsuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [modalAbierto, setModalAbierto] = useState(false);
  const [usuarioEditando, setUsuarioEditando] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [eliminandoId, setEliminandoId] = useState(null);
  const [form] = Form.useForm();

  const usuarioActual = useMemo(() => {
    const raw = localStorage.getItem('usuario');
    return raw ? JSON.parse(raw) : null;
  }, []);

  function cargarUsuarios() {
    setCargando(true);
    listarUsuarios()
      .then(setUsuarios)
      .catch((err) => message.error(err.message))
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    cargarUsuarios();
  }, []);

  const usuariosFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return usuarios;
    return usuarios.filter(
      (u) =>
        u.nombre.toLowerCase().includes(termino) ||
        u.usuario.toLowerCase().includes(termino)
    );
  }, [usuarios, busqueda]);

  function abrirCrear() {
    setUsuarioEditando(null);
    form.resetFields();
    form.setFieldsValue({ rol: 'usuario' });
    setModalAbierto(true);
  }

  function abrirEditar(item) {
    setUsuarioEditando(item);
    form.resetFields();
    form.setFieldsValue({
      nombre: item.nombre,
      usuario: item.usuario,
      rol: item.rol,
    });
    setModalAbierto(true);
  }

  function cerrarModal() {
    setModalAbierto(false);
    setUsuarioEditando(null);
    form.resetFields();
  }

  async function guardarUsuario() {
    try {
      const valores = await form.validateFields();
      setGuardando(true);

      if (usuarioEditando) {
        const payload = {
          nombre: valores.nombre.trim(),
          usuario: valores.usuario.trim(),
          rol: valores.rol,
        };
        if (valores.password) payload.password = valores.password;

        const actualizado = await actualizarUsuario(usuarioEditando.id, payload);
        setUsuarios((prev) =>
          prev.map((u) => (u.id === usuarioEditando.id ? actualizado : u))
        );
        message.success(`Usuario "${actualizado.usuario}" actualizado.`);
      } else {
        const payload = {
          nombre: valores.nombre.trim(),
          usuario: valores.usuario.trim(),
          rol: valores.rol,
          password: valores.password,
        };

        const creado = await crearUsuario(payload);
        setUsuarios((prev) => [...prev, creado].sort((a, b) => a.nombre.localeCompare(b.nombre)));
        message.success(`Usuario "${creado.usuario}" creado.`);
      }

      cerrarModal();
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err.message || 'Error al procesar el usuario.');
    } finally {
      setGuardando(false);
    }
  }

  async function manejarEliminar(id) {
    setEliminandoId(id);
    try {
      await eliminarUsuario(id);
      setUsuarios((prev) => prev.filter((u) => u.id !== id));
      message.success('Usuario eliminado.');
    } catch (err) {
      message.error(err.message);
    } finally {
      setEliminandoId(null);
    }
  }

  const columnas = [
    {
      title: 'Nombre',
      dataIndex: 'nombre',
      key: 'nombre',
      sorter: (a, b) => a.nombre.localeCompare(b.nombre),
    },
    {
      title: 'Usuario (Login)',
      dataIndex: 'usuario',
      key: 'usuario',
      render: (usr) => <Text code>{usr}</Text>,
      sorter: (a, b) => a.usuario.localeCompare(b.usuario),
    },
    {
      title: 'Rol',
      dataIndex: 'rol',
      key: 'rol',
      width: 140,
      render: (rol) => (
        <Tag color={rol === 'administrador' ? 'geekblue' : 'green'}>
          {rol.toUpperCase()}
        </Tag>
      ),
      filters: [
        { text: 'Administrador', value: 'administrador' },
        { text: 'Usuario', value: 'usuario' },
      ],
      onFilter: (value, record) => record.rol === value,
    },
    {
      title: 'Acciones',
      key: 'acciones',
      width: 100,
      align: 'center',
      render: (_, record) => {
        const esMismoUsuario = usuarioActual?.id === record.id;
        return (
          <Space size="small">
            <Tooltip title="Editar usuario">
              <Button
                type="text"
                icon={<Icon icon="mdi:pencil-outline" />}
                onClick={() => abrirEditar(record)}
              />
            </Tooltip>
            <Tooltip title={esMismoUsuario ? 'No puedes eliminar tu cuenta' : 'Eliminar usuario'}>
              <Popconfirm
                title="¿Eliminar este usuario?"
                description="No podrá eliminarse si cuenta con ejecuciones previas (RNF-08)."
                okText="Eliminar"
                cancelText="Cancelar"
                okButtonProps={{ danger: true }}
                disabled={esMismoUsuario}
                onConfirm={() => manejarEliminar(record.id)}
              >
                <Button
                  type="text"
                  danger
                  icon={<Icon icon="mdi:trash-can-outline" />}
                  loading={eliminandoId === record.id}
                  disabled={esMismoUsuario}
                />
              </Popconfirm>
            </Tooltip>
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ minHeight: 'calc(100vh - 64px)', background: '#f1f5f9', padding: '32px 16px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ marginBottom: 16 }}>
          <Title level={4} style={{ marginBottom: 4 }}>
            <Icon icon="mdi:account-cog-outline" style={{ marginRight: 8 }} />
            Administración de Usuarios
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Gestión de credenciales, roles y acceso al sistema
          </Text>
        </div>

        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Space>
            <Button
              type="primary"
              icon={<Icon icon="mdi:account-plus-outline" />}
              onClick={abrirCrear}
            >
              Nuevo usuario
            </Button>
            <Text type="secondary" style={{ fontSize: 13, marginLeft: 8 }}>
              {usuarios.length} cuentas registradas
            </Text>
          </Space>
          <Input.Search
            placeholder="Buscar por nombre o usuario..."
            allowClear
            style={{ width: 280 }}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        <Table
          rowKey="id"
          columns={columnas}
          dataSource={usuariosFiltrados}
          loading={cargando}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          style={{ background: '#fff', borderRadius: 8 }}
        />

        <Modal
          title={usuarioEditando ? `Editar Usuario: ${usuarioEditando.usuario}` : 'Crear Nuevo Usuario'}
          open={modalAbierto}
          onCancel={cerrarModal}
          onOk={guardarUsuario}
          confirmLoading={guardando}
          okText="Guardar"
          cancelText="Cancelar"
          destroyOnClose
        >
          <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
            <Form.Item
              name="nombre"
              label="Nombre Completo"
              rules={[{ required: true, message: 'El nombre es obligatorio.' }]}
            >
              <Input placeholder="Ej. Carlos Restrepo" />
            </Form.Item>

            <Form.Item
              name="usuario"
              label="Nombre de Usuario (Login)"
              rules={[
                { required: true, message: 'El usuario de acceso es obligatorio.' },
                { min: 3, message: 'Mínimo 3 caracteres.' }
              ]}
            >
              <Input placeholder="Ej. crestrepo" />
            </Form.Item>

            <Form.Item
              name="rol"
              label="Rol"
              rules={[{ required: true, message: 'Selecciona un rol.' }]}
            >
              <Select
                options={[
                  { label: 'Administrador (Control total)', value: 'administrador' },
                  { label: 'Usuario', value: 'usuario' },
                ]}
              />
            </Form.Item>

            <Form.Item
              name="password"
              label={usuarioEditando ? 'Contraseña (vacío para conservar actual)' : 'Contraseña'}
              rules={[
                { required: !usuarioEditando, message: 'La contraseña es requerida.' },
                { min: 8, message: 'Debe contener mínimo 8 caracteres.' },
              ]}
            >
              <Input.Password placeholder={usuarioEditando ? '•••••••• (sin cambios)' : 'Mínimo 8 caracteres'} />
            </Form.Item>
          </Form>
        </Modal>
      </div>
    </div>
  );
}

export default PanelUsuarios;