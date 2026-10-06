import { useEffect, useState, useMemo } from 'react';
import { Table, Input, Button, Modal, Form, Select, Tag, Typography, Space, message, Tooltip, Tabs, Alert, List, Empty, Popconfirm } from 'antd';
import { Icon } from '@iconify/react';
import {
    listarMunicipiosAdmin,
    actualizarCorreosMunicipio,
    obtenerPlantillaCorreo,
    actualizarPlantillaCorreo,
    listarCorreosNotificacion,
    agregarCorreoNotificacion,
    eliminarCorreoNotificacion,
} from '../api/client';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const VARIABLES_DISPONIBLES = [
    { clave: '{saludo}', descripcion: 'Buenos días / Buenas tardes (automático)' },
    { clave: '{mes}', descripcion: 'Nombre del mes en español' },
    { clave: '{anio}', descripcion: 'Año de la ejecución' },
    { clave: '{municipio}', descripcion: 'Nombre del municipio' },
];

function validarListaCorreos(_, lista) {
    if (!Array.isArray(lista) || lista.length === 0) return Promise.resolve();
    const invalido = lista.find((email) => !REGEX_EMAIL.test(String(email).trim()));
    if (invalido) {
        return Promise.reject(new Error(`"${invalido}" no es un correo válido.`));
    }
    return Promise.resolve();
}

function CeldaCorreos({ lista, color }) {
    if (!lista || lista.length === 0) {
        return <Text type="secondary" style={{ fontSize: 12 }}>—</Text>;
    }
    return (
        <Space size={[4, 4]} wrap>
            {lista.map((email) => (
                <Tag key={email} color={color} style={{ fontSize: 11 }}>{email}</Tag>
            ))}
        </Space>
    );
}

function TabCorreosMunicipio() {
    const [municipios, setMunicipios] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [busqueda, setBusqueda] = useState('');
    const [municipioEditando, setMunicipioEditando] = useState(null);
    const [guardando, setGuardando] = useState(false);
    const [form] = Form.useForm();

    function cargarMunicipios() {
        setCargando(true);
        listarMunicipiosAdmin()
            .then(setMunicipios)
            .catch((err) => message.error(err.message))
            .finally(() => setCargando(false));
    }

    useEffect(() => {
        cargarMunicipios();
    }, []);

    const municipiosFiltrados = useMemo(() => {
        const termino = busqueda.trim().toLowerCase();
        if (!termino) return municipios;
        return municipios.filter(
            (m) => m.nombre.toLowerCase().includes(termino) || m.codigoBcgs.includes(termino)
        );
    }, [municipios, busqueda]);

    function abrirEdicion(municipio) {
        setMunicipioEditando(municipio);
        form.setFieldsValue({
            para: municipio.correos.para,
            cc: municipio.correos.cc,
            cco: municipio.correos.cco,
        });
    }

    function cerrarEdicion() {
        setMunicipioEditando(null);
        form.resetFields();
    }

    async function guardarCorreos() {
        try {
            const valores = await form.validateFields();
            setGuardando(true);

            const limpiar = (lista) => (lista || []).map((e) => String(e).trim()).filter(Boolean);
            const correos = {
                para: limpiar(valores.para),
                cc: limpiar(valores.cc),
                cco: limpiar(valores.cco),
            };

            await actualizarCorreosMunicipio(municipioEditando.id, correos);

            setMunicipios((prev) =>
                prev.map((m) => (m.id === municipioEditando.id ? { ...m, correos } : m))
            );

            message.success(`Correos de ${municipioEditando.nombre} actualizados.`);
            cerrarEdicion();
        } catch (err) {
            if (err?.errorFields) return; 
            message.error(err.message || 'No se pudo guardar los cambios.');
        } finally {
            setGuardando(false);
        }
    }

    const columnas = [
        {
            title: 'Código',
            dataIndex: 'codigoBcgs',
            key: 'codigoBcgs',
            width: 90,
            sorter: (a, b) => a.codigoBcgs.localeCompare(b.codigoBcgs),
        },
        {
            title: 'Municipio',
            dataIndex: 'nombre',
            key: 'nombre',
            width: 160,
            sorter: (a, b) => a.nombre.localeCompare(b.nombre),
        },
        {
            title: 'Para',
            key: 'para',
            render: (_, m) => <CeldaCorreos lista={m.correos.para} color="blue" />,
        },
        {
            title: 'CC',
            key: 'cc',
            render: (_, m) => <CeldaCorreos lista={m.correos.cc} color="default" />,
        },
        {
            title: 'CCO',
            key: 'cco',
            render: (_, m) => <CeldaCorreos lista={m.correos.cco} color="default" />,
        },
        {
            title: '',
            key: 'acciones',
            width: 60,
            render: (_, m) => (
                <Tooltip title="Editar correos">
                    <Button
                        type="text"
                        icon={<Icon icon="mdi:pencil-outline" />}
                        onClick={() => abrirEdicion(m)}
                    />
                </Tooltip>
            ),
        },
    ];

    return (
        <>
            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text type="secondary" style={{ fontSize: 13 }}>
                    {municipios.length} municipios registrados
                </Text>
                <Input.Search
                    placeholder="Buscar por nombre o código..."
                    allowClear
                    style={{ width: 280 }}
                    onChange={(e) => setBusqueda(e.target.value)}
                />
            </div>

            <Table
                rowKey="id"
                columns={columnas}
                dataSource={municipiosFiltrados}
                loading={cargando}
                pagination={{ pageSize: 15, showSizeChanger: false }}
                style={{ background: '#fff', borderRadius: 8 }}
            />

            <Modal
                title={municipioEditando ? `Correos de ${municipioEditando.nombre}` : ''}
                open={!!municipioEditando}
                onCancel={cerrarEdicion}
                onOk={guardarCorreos}
                confirmLoading={guardando}
                okText="Guardar"
                cancelText="Cancelar"
                destroyOnClose
            >
                <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
                    <Form.Item
                        name="para"
                        label="Para (destinatario principal)"
                        rules={[
                            { validator: validarListaCorreos },
                            {
                                validator: (_, v) =>
                                    v && v.length > 0
                                        ? Promise.resolve()
                                        : Promise.reject(new Error('Debes agregar al menos un correo destinatario.')),
                            },
                        ]}
                    >
                        <Select mode="tags" open={false} tokenSeparators={[',', ' ']} placeholder="correo@ejemplo.com" />
                    </Form.Item>

                    <Form.Item name="cc" label="CC" rules={[{ validator: validarListaCorreos }]}>
                        <Select mode="tags" open={false} tokenSeparators={[',', ' ']} placeholder="correo@ejemplo.com" />
                    </Form.Item>

                    <Form.Item name="cco" label="CCO" rules={[{ validator: validarListaCorreos }]}>
                        <Select mode="tags" open={false} tokenSeparators={[',', ' ']} placeholder="correo@ejemplo.com" />
                    </Form.Item>
                </Form>
            </Modal>
        </>
    );
}

function TabPlantillaCorreo() {
    const [cargando, setCargando] = useState(true);
    const [guardando, setGuardando] = useState(false);
    const [form] = Form.useForm();

    function cargarPlantilla() {
        setCargando(true);
        obtenerPlantillaCorreo()
            .then((data) => form.setFieldsValue({ asunto: data.asunto, cuerpo: data.cuerpo }))
            .catch((err) => message.error(err.message))
            .finally(() => setCargando(false));
    }

    useEffect(() => {
        cargarPlantilla();
    }, []);

    async function guardar() {
        try {
            const valores = await form.validateFields();
            setGuardando(true);
            await actualizarPlantillaCorreo(valores.asunto, valores.cuerpo);
            message.success('Plantilla de correo actualizada.');
        } catch (err) {
            if (err?.errorFields) return;
            message.error(err.message || 'No se pudo guardar la plantilla.');
        } finally {
            setGuardando(false);
        }
    }

    return (
        <div style={{ maxWidth: 700 }}>
            <Alert
                type="info"
                showIcon
                style={{ marginBottom: 20 }}
                message="Variables disponibles"
                description={
                    <Space direction="vertical" size={2}>
                        {VARIABLES_DISPONIBLES.map((v) => (
                            <Text key={v.clave} style={{ fontSize: 13 }}>
                                <Text code>{v.clave}</Text> — {v.descripcion}
                            </Text>
                        ))}
                    </Space>
                }
            />

            <Form form={form} layout="vertical" disabled={cargando}>
                <Form.Item
                    name="asunto"
                    label="Asunto"
                    rules={[{ required: true, message: 'El asunto no puede estar vacío.' }]}
                >
                    <Input placeholder="Entrega de los movimientos generados en el mes de {mes} de {anio}..." />
                </Form.Item>

                <Form.Item
                    name="cuerpo"
                    label="Cuerpo del mensaje"
                    rules={[{ required: true, message: 'El cuerpo no puede estar vacío.' }]}
                >
                    <TextArea rows={10} placeholder="{saludo}, ..." />
                </Form.Item>

                <Button type="primary" loading={guardando} onClick={guardar}>
                    Guardar plantilla
                </Button>
            </Form>
        </div>
    );
}

function TabNotificaciones() {
    const [correos, setCorreos] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [nuevoEmail, setNuevoEmail] = useState('');
    const [agregando, setAgregando] = useState(false);
    const [eliminandoId, setEliminandoId] = useState(null);

    function cargarCorreos() {
        setCargando(true);
        listarCorreosNotificacion()
            .then(setCorreos)
            .catch((err) => message.error(err.message))
            .finally(() => setCargando(false));
    }

    useEffect(() => {
        cargarCorreos();
    }, []);

    async function manejarAgregar() {
        const limpio = nuevoEmail.trim();
        if (!limpio) return;

        if (!REGEX_EMAIL.test(limpio)) {
            message.error('Ese correo no tiene un formato válido.');
            return;
        }

        setAgregando(true);
        try {
            const creado = await agregarCorreoNotificacion(limpio);
            setCorreos((prev) => [...prev, creado]);
            setNuevoEmail('');
            message.success('Correo agregado.');
        } catch (err) {
            message.error(err.message);
        } finally {
            setAgregando(false);
        }
    }

    async function manejarEliminar(id) {
        setEliminandoId(id);
        try {
            await eliminarCorreoNotificacion(id);
            setCorreos((prev) => prev.filter((c) => c.id !== id));
            message.success('Correo eliminado.');
        } catch (err) {
            message.error(err.message);
        } finally {
            setEliminandoId(null);
        }
    }

    return (
        <div style={{ maxWidth: 600 }}>
            <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 20 }}>
                Estos correos reciben el aviso de "proceso finalizado correctamente" con el reporte
                adjunto cada vez que termina una ejecución de descarga y envío.
            </Paragraph>

            <Space.Compact style={{ width: '100%', marginBottom: 20 }}>
                <Input
                    placeholder="correo@antioquia.gov.co"
                    value={nuevoEmail}
                    onChange={(e) => setNuevoEmail(e.target.value)}
                    onPressEnter={manejarAgregar}
                />
                <Button type="primary" icon={<Icon icon="mdi:plus" />} loading={agregando} onClick={manejarAgregar}>
                    Agregar
                </Button>
            </Space.Compact>

            <List
                loading={cargando}
                dataSource={correos}
                locale={{ emptyText: <Empty description="Sin correos configurados todavía" /> }}
                bordered
                style={{ background: '#fff', borderRadius: 8 }}
                renderItem={(c) => (
                    <List.Item
                        actions={[
                            <Popconfirm
                                key="eliminar"
                                title="¿Eliminar este correo?"
                                onConfirm={() => manejarEliminar(c.id)}
                            >
                                <Button
                                    type="text"
                                    danger
                                    icon={<Icon icon="mdi:trash-can-outline" />}
                                    loading={eliminandoId === c.id}
                                />
                            </Popconfirm>,
                        ]}
                    >
                        <Space>
                            <Icon icon="mdi:email-outline" />
                            {c.email}
                        </Space>
                    </List.Item>
                )}
            />
        </div>
    );
}

function PanelAdministracion() {
    return (
        <div style={{ minHeight: 'calc(100vh - 64px)', background: '#f1f5f9', padding: '32px 16px' }}>
            <div style={{ maxWidth: 1100, margin: '0 auto' }}>
                <div style={{ marginBottom: 16 }}>
                    <Title level={4} style={{ marginBottom: 4 }}>
                        <Icon icon="mdi:email-edit-outline" style={{ marginRight: 8 }} />
                        Panel de Administración
                    </Title>
                    <Text type="secondary" style={{ fontSize: 13 }}>
                        Gestión de correos por municipio, plantilla de envío y notificaciones
                    </Text>
                </div>

                <Tabs
                    defaultActiveKey="municipios"
                    items={[
                        {
                            key: 'municipios',
                            label: 'Correos por municipio',
                            children: <TabCorreosMunicipio />,
                        },
                        {
                            key: 'plantilla',
                            label: 'Plantilla de correo',
                            children: <TabPlantillaCorreo />,
                        },
                        {
                            key: 'notificaciones',
                            label: 'Notificaciones',
                            children: <TabNotificaciones />,
                        },
                    ]}
                />
            </div>
        </div>
    );
}

export default PanelAdministracion;