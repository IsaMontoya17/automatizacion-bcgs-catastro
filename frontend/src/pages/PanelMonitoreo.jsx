import { useEffect, useState, useRef, useMemo } from 'react';
import { Card, Progress, Tag, Typography, Statistic, Row, Col, Timeline, Space, Button, Alert } from 'antd';
import { Icon } from '@iconify/react';
import socket from '../api/socket';
import { consultarEjecucion, reintentarEnvio } from '../api/client';

const { Title, Text } = Typography;

const MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const ESTATUS_TAG = {
    completado: { color: 'success', texto: 'Completado' },
    error: { color: 'error', texto: 'Error' },
    en_progreso: { color: 'processing', texto: 'En progreso' },
    pendiente: { color: 'default', texto: 'Pendiente' },
    interrumpido: { color: 'error', texto: 'Interrumpida' },
    no_iniciado: { color: 'default', texto: 'No iniciada' },
};

function PanelMonitoreo({ ejecucionId, mes, anio, onNuevaEjecucion, onEjecucionInvalida }) {
    const [eventos, setEventos] = useState([]);
    const [estatus, setEstatus] = useState('en_progreso');
    const [reporte, setReporte] = useState(null);
    const [reintentando, setReintentando] = useState({});
    const finRef = useRef(null);

    useEffect(() => {
        consultarEjecucion(ejecucionId)
            .then((estado) => {
                setEventos(estado.eventos || []);
                setEstatus(estado.estatus);
                setReporte(estado.reporte);
            })
            .catch(() => {
                onEjecucionInvalida?.();
            });

        socket.connect();
        socket.emit('unirse_ejecucion', ejecucionId);

        function manejarProgreso(evento) {
            setEventos((prev) => [...prev, evento]);
        }

        function manejarEstadoFinal({ estatus, reporte, error }) {
            setEstatus(estatus);
            if (reporte) setReporte(reporte);
            if (error) setEventos((prev) => [...prev, { tipo: 'error_general', error }]);
        }

        socket.on('progreso', manejarProgreso);
        socket.on('estado_final', manejarEstadoFinal);

        return () => {
            socket.off('progreso', manejarProgreso);
            socket.off('estado_final', manejarEstadoFinal);
            socket.disconnect();
        };
    }, [ejecucionId]);

    useEffect(() => {
        finRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [eventos]);

    const estadoReconstruccion = useMemo(() => {
        if (eventos.length > 0 || !reporte) return 'ninguna';
        return reporte.parcial ? 'interrumpida' : 'completa';
    }, [eventos, reporte]);

    const reconstruido = estadoReconstruccion !== 'ninguna';
    const interrumpida = estadoReconstruccion === 'interrumpida';

    const { eventosDescarga, eventosEnvio, envioIniciado } = useMemo(() => {
        const indiceCorte = eventos.findIndex((e) => e.tipo === 'iniciando_envio_correos');
        if (indiceCorte === -1) {
            const envioYaOcurrio = estadoReconstruccion === 'completa' && !!reporte?.envio;
            return { eventosDescarga: eventos, eventosEnvio: [], envioIniciado: envioYaOcurrio };
        }
        return {
            eventosDescarga: eventos.slice(0, indiceCorte),
            eventosEnvio: eventos.slice(indiceCorte + 1),
            envioIniciado: true,
        };
    }, [eventos, reporte, estadoReconstruccion]);

    const totalMunicipios = estadoReconstruccion === 'completa'
        ? (reporte.descarga?.exitosos?.length ?? 0) +
          (reporte.descarga?.sin_resoluciones?.length ?? 0) +
          (reporte.descarga?.fallidos?.length ?? 0)
        : eventosDescarga.find((e) => e.tipo === 'municipios_encontrados')?.total;

    const descargaExitosos = reconstruido
        ? reporte.descarga?.exitosos?.length ?? 0
        : eventosDescarga.filter((e) => e.tipo === 'descarga_ok').length;
    const descargaSinMovimiento = reconstruido
        ? reporte.descarga?.sin_resoluciones?.length ?? 0
        : eventosDescarga.filter((e) => e.tipo === 'descarga_sin_datos').length;
    const descargaFallos = reconstruido
        ? reporte.descarga?.fallidos?.length ?? 0
        : eventosDescarga.filter((e) => e.tipo === 'descarga_error').length;
    const descargaProcesados = descargaExitosos + descargaSinMovimiento + descargaFallos;
    const descargaPorcentaje = totalMunicipios ? Math.round((descargaProcesados / totalMunicipios) * 100) : 0;
    const descargaCompleta = totalMunicipios && descargaProcesados >= totalMunicipios;

    const rangoFechas = useMemo(() => {
        const eventoFechas = eventosDescarga.find((e) => e.tipo === 'fechas_establecidas');
        if (eventoFechas) {
            return { fechaInicial: eventoFechas.fechaInicial, fechaFinal: eventoFechas.fechaFinal };
        }
        return null;
    }, [eventosDescarga]);

    const totalAEnviar = estadoReconstruccion === 'completa'
        ? (reporte.envio?.exitosos?.length ?? 0) + (reporte.envio?.requieren_revision_manual?.length ?? 0)
        : eventosEnvio.find((e) => e.tipo === 'inicio_envio')?.total;
    const envioExitosos = reconstruido
        ? reporte.envio?.exitosos?.length ?? 0
        : eventosEnvio.filter((e) => e.tipo === 'envio_ok').length;
    const envioRevisionManual = reconstruido
        ? reporte.envio?.requieren_revision_manual?.length ?? 0
        : eventosEnvio.filter((e) => e.tipo === 'envio_revision_manual').length;
    const envioProcesados = envioExitosos + envioRevisionManual;
    const envioPorcentaje = totalAEnviar ? Math.round((envioProcesados / totalAEnviar) * 100) : 0;

    let estatusDescarga;
    let estatusEnvio;

    if (interrumpida) {
        estatusDescarga = 'interrumpido';
        estatusEnvio = reporte.envioIniciado ? 'interrumpido' : 'no_iniciado';
    } else {
        estatusDescarga = descargaCompleta ? 'completado' : 'en_progreso';
        estatusEnvio = !envioIniciado
            ? 'pendiente'
            : reporte?.envio
                ? 'completado'
                : 'en_progreso';
    }

    const tagGeneral = ESTATUS_TAG[estatus] || ESTATUS_TAG.en_progreso;

    const municipiosSinMovimiento = reporte?.descarga?.sin_resoluciones ?? [];

    const municipiosRevisionManual = useMemo(() => {
        if (reconstruido) {
            return (reporte.envio?.requieren_revision_manual ?? []).map((m) => ({
                tipo: 'envio_revision_manual',
                municipio: m.municipio,
                codigo: m.codigo,
            }));
        }
        const estadoPorCodigo = new Map();
        eventosEnvio
            .filter((e) => e.tipo === 'envio_ok' || e.tipo === 'envio_revision_manual')
            .forEach((e) => {
                const clave = e.codigo ?? e.municipio;
                estadoPorCodigo.set(clave, { tipo: e.tipo, municipio: e.municipio, codigo: e.codigo });
            });
        return Array.from(estadoPorCodigo.values()).filter((e) => e.tipo === 'envio_revision_manual');
    }, [eventosEnvio, reconstruido, reporte]);

    async function manejarReintentar(codigo) {
        setReintentando((prev) => ({ ...prev, [codigo]: true }));
        try {
            await reintentarEnvio(ejecucionId, [codigo]);
        } catch (err) {
            
        } finally {
            setReintentando((prev) => ({ ...prev, [codigo]: false }));
        }
    }

    async function manejarReintentarTodos() {
        setReintentando((prev) => ({ ...prev, __todos__: true }));
        try {
            await reintentarEnvio(ejecucionId);
        } catch (err) {

        } finally {
            setReintentando((prev) => ({ ...prev, __todos__: false }));
        }
    }

    return (
        <div style={{ minHeight: 'calc(100vh - 64px)', background: '#f1f5f9', padding: '32px 16px' }}>
            <div style={{ maxWidth: 1100, margin: '0 auto' }}>
                <div style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div>
                        <Title level={4} style={{ marginBottom: 4 }}>
                            Ejecución de {MESES[mes - 1]} {anio}
                        </Title>
                        <Space size={8}>
                            <Tag color={tagGeneral.color}>{tagGeneral.texto}</Tag>
                            {rangoFechas && (
                                <Tag icon={<Icon icon="mdi:calendar-range-outline" />} color="blue">
                                    {rangoFechas.fechaInicial} → {rangoFechas.fechaFinal}
                                </Tag>
                            )}
                        </Space>
                    </div>

                    {(estatus === 'completado' || estatus === 'error') && (
                        <Button
                            icon={<Icon icon="mdi:plus-circle-outline" />}
                            onClick={onNuevaEjecucion}
                        >
                            Nueva ejecución
                        </Button>
                    )}
                </div>

                {interrumpida && (
                    <Alert
                        type="warning"
                        showIcon
                        style={{ marginBottom: 16 }}
                        message="Esta ejecución se interrumpió antes de terminar"
                        description="El servidor se reinició (o se detuvo) mientras el proceso estaba corriendo. Los números que ves abajo son solo los municipios que alcanzaron a procesarse antes de la interrupción — no representan el total de los 113. Para completar el mes, inicia una nueva ejecución."
                    />
                )}

                <Row gutter={16}>
                    <Col xs={24} lg={12} style={{ marginBottom: 16 }}>
                        <Card style={{ height: '100%' }}>
                            <Title level={5} style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Icon icon="material-symbols:download-for-offline" />
                                1. Descarga de resoluciones (BCGS)
                                <Tag color={ESTATUS_TAG[estatusDescarga].color} style={{ marginLeft: 'auto' }}>
                                    {ESTATUS_TAG[estatusDescarga].texto}
                                </Tag>
                            </Title>

                            {interrumpida ? (
                                <>
                                    <Text type="secondary" style={{ fontSize: 13 }}>
                                        Municipios que alcanzaron a procesarse antes de la interrupción:
                                    </Text>
                                    <Row gutter={16} style={{ marginTop: 12 }}>
                                        <Col span={8}>
                                            <Statistic
                                                title="Éxitos"
                                                value={descargaExitosos}
                                                prefix={<Icon icon="ooui:success" style={{ color: '#22c55e' }} />}
                                            />
                                        </Col>
                                        <Col span={8}>
                                            <Statistic
                                                title="Sin movimiento"
                                                value={descargaSinMovimiento}
                                                prefix={<Icon icon="fa-solid:empty-set" style={{ color: '#94a3b8', fontSize: 20 }} />}
                                            />
                                        </Col>
                                        <Col span={8}>
                                            <Statistic
                                                title="Fallos"
                                                value={descargaFallos}
                                                prefix={<Icon icon="material-symbols:chat-error" style={{ color: '#ef4444' }} />}
                                            />
                                        </Col>
                                    </Row>
                                </>
                            ) : totalMunicipios ? (
                                <>
                                    <Progress
                                        percent={descargaPorcentaje}
                                        status={
                                            estatus === 'error' && !descargaCompleta
                                                ? 'exception'
                                                : descargaCompleta
                                                    ? 'success'
                                                    : 'active'
                                        }
                                    />
                                    <Row gutter={16} style={{ marginTop: 12 }}>
                                        <Col span={8}>
                                            <Statistic
                                                title="Éxitos"
                                                value={descargaExitosos}
                                                prefix={<Icon icon="ooui:success" style={{ color: '#22c55e' }} />}
                                            />
                                        </Col>
                                        <Col span={8}>
                                            <Statistic
                                                title="Sin movimiento"
                                                value={descargaSinMovimiento}
                                                prefix={<Icon icon="fa-solid:empty-set" style={{ color: '#94a3b8', fontSize: 20 }} />}
                                            />
                                        </Col>
                                        <Col span={8}>
                                            <Statistic
                                                title="Fallos"
                                                value={descargaFallos}
                                                prefix={<Icon icon="material-symbols:chat-error" style={{ color: '#ef4444' }} />}
                                            />
                                        </Col>
                                    </Row>
                                </>
                            ) : (
                                <Text type="secondary">Iniciando sesión en BCGS...</Text>
                            )}

                            {municipiosSinMovimiento.length > 0 && (
                                <div style={{ marginTop: 16 }}>
                                    <Text strong style={{ fontSize: 13 }}>Municipios sin movimiento:</Text>
                                    <div style={{ marginTop: 8, maxHeight: 100, overflowY: 'auto' }}>
                                        <Space size={[4, 4]} wrap>
                                            {municipiosSinMovimiento.map((m) => (
                                                <Tag key={m.codigo} color="default">{m.municipio}</Tag>
                                            ))}
                                        </Space>
                                    </div>
                                </div>
                            )}

                            {!reconstruido && (
                                <div style={{ marginTop: 16, maxHeight: 200, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
                                    <Timeline
                                        items={eventosDescarga
                                            .filter((e) => e.municipio || e.error)
                                            .map((e) => ({
                                                children: (
                                                    <Text style={{ fontSize: 12 }}>
                                                        <Text code>{e.tipo}</Text> {e.municipio || ''} {e.error ? `— ${e.error}` : ''}
                                                    </Text>
                                                ),
                                            }))}
                                    />
                                </div>
                            )}
                        </Card>
                    </Col>

                    <Col xs={24} lg={12} style={{ marginBottom: 16 }}>
                        <Card style={{ height: '100%', opacity: (interrumpida ? true : envioIniciado) ? 1 : 0.5 }}>
                            <Title level={5} style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Icon icon="ic:round-email" />
                                2. Envío de correos
                                <Tag color={ESTATUS_TAG[estatusEnvio].color} style={{ marginLeft: 'auto' }}>
                                    {ESTATUS_TAG[estatusEnvio].texto}
                                </Tag>
                            </Title>

                            {interrumpida ? (
                                !reporte.envioIniciado ? (
                                    <Text type="secondary">
                                        La ejecución se interrumpió durante la descarga, antes de llegar a esta fase.
                                    </Text>
                                ) : (
                                    <>
                                        <Text type="secondary" style={{ fontSize: 13 }}>
                                            Correos que alcanzaron a procesarse antes de la interrupción:
                                        </Text>
                                        <Row gutter={16} style={{ marginTop: 12 }}>
                                            <Col span={12}>
                                                <Statistic
                                                    title="Enviados"
                                                    value={envioExitosos}
                                                    prefix={<Icon icon="ooui:success" style={{ color: '#22c55e' }} />}
                                                />
                                            </Col>
                                            <Col span={12}>
                                                <Statistic
                                                    title="Requieren revisión"
                                                    value={envioRevisionManual}
                                                    prefix={<Icon icon="fluent:document-search-16-filled" style={{ color: '#f59e0b' }} />}
                                                />
                                            </Col>
                                        </Row>
                                    </>
                                )
                            ) : !envioIniciado ? (
                                <Text type="secondary">Se activará cuando finalice la descarga.</Text>
                            ) : totalAEnviar ? (
                                <>
                                    <Progress
                                        percent={envioPorcentaje}
                                        status={
                                            estatus === 'error'
                                                ? 'exception'
                                                : envioProcesados >= totalAEnviar
                                                    ? 'success'
                                                    : 'active'
                                        }
                                    />
                                    <Row gutter={16} style={{ marginTop: 12 }}>
                                        <Col span={12}>
                                            <Statistic
                                                title="Enviados"
                                                value={envioExitosos}
                                                prefix={<Icon icon="ooui:success" style={{ color: '#22c55e' }} />}
                                            />
                                        </Col>
                                        <Col span={12}>
                                            <Statistic
                                                title="Requieren revisión"
                                                value={envioRevisionManual}
                                                prefix={<Icon icon="fluent:document-search-16-filled" style={{ color: '#f59e0b' }} />}
                                            />
                                        </Col>
                                    </Row>
                                </>
                            ) : (
                                <Text type="secondary">Preparando el envío de correos...</Text>
                            )}

                            {!interrumpida && municipiosRevisionManual.length > 0 && (
                                <div style={{ marginTop: 16 }}>
                                    <Text strong style={{ fontSize: 13 }}>Requieren revisión manual:</Text>
                                    <div style={{ marginTop: 8, maxHeight: 120, overflowY: 'auto' }}>
                                        <Space size={[4, 8]} wrap>
                                            {municipiosRevisionManual.map((m) => (
                                                <Tag
                                                    key={m.codigo}
                                                    color="warning"
                                                    style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                                                >
                                                    {m.municipio}
                                                    <Button
                                                        type="link"
                                                        size="small"
                                                        icon={<Icon icon="mdi:refresh" />}
                                                        loading={!!reintentando[m.codigo]}
                                                        onClick={() => manejarReintentar(m.codigo)}
                                                        style={{ padding: 0, height: 'auto' }}
                                                    />
                                                </Tag>
                                            ))}
                                        </Space>
                                    </div>
                                    <Button
                                        size="small"
                                        style={{ marginTop: 8 }}
                                        icon={<Icon icon="mdi:refresh" />}
                                        loading={!!reintentando.__todos__}
                                        onClick={manejarReintentarTodos}
                                    >
                                        Reintentar todos ({municipiosRevisionManual.length})
                                    </Button>
                                </div>
                            )}

                            {envioIniciado && !reconstruido && (
                                <div style={{ marginTop: 16, maxHeight: 200, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
                                    <Timeline
                                        items={eventosEnvio
                                            .filter((e) => e.municipio || e.error)
                                            .map((e) => ({
                                                children: (
                                                    <Text style={{ fontSize: 12 }}>
                                                        <Text code>{e.tipo}</Text> {e.municipio || ''} {e.error ? `— ${e.error}` : ''}
                                                    </Text>
                                                ),
                                            }))}
                                    />
                                </div>
                            )}
                        </Card>
                    </Col>
                </Row>

                <div ref={finRef} />

                {reporte && !interrumpida && (
                    <Card style={{ marginTop: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                            <Icon
                                icon="ooui:success"
                                style={{ fontSize: 28, color: '#22c55e' }}
                            />
                            <div>
                                <Title level={5} style={{ margin: 0 }}>Ejecución finalizada</Title>
                                <Text type="secondary" style={{ fontSize: 13 }}>
                                    {MESES[mes - 1]} {anio}
                                    {rangoFechas ? ` (${rangoFechas.fechaInicial} → ${rangoFechas.fechaFinal})` : ''}
                                    {' '}— proceso completo de descarga y envío
                                </Text>
                            </div>
                        </div>

                        <Row gutter={[16, 16]}>
                            <Col xs={12} sm={6}>
                                <Card size="small" style={{ textAlign: 'center', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                                    <Icon icon="ooui:success" style={{ fontSize: 22, color: '#22c55e' }} />
                                    <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>
                                        {reporte.descarga?.exitosos?.length ?? 0}
                                    </div>
                                    <Text type="secondary" style={{ fontSize: 12 }}>Resoluciones descargadas</Text>
                                </Card>
                            </Col>

                            <Col xs={12} sm={6}>
                                <Card size="small" style={{ textAlign: 'center', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                                    <Icon icon="fa-solid:empty-set" style={{ fontSize: 20, color: '#94a3b8' }} />
                                    <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>
                                        {reporte.descarga?.sin_resoluciones?.length ?? 0}
                                    </div>
                                    <Text type="secondary" style={{ fontSize: 12 }}>Sin movimiento</Text>
                                </Card>
                            </Col>

                            <Col xs={12} sm={6}>
                                <Card size="small" style={{ textAlign: 'center', background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                                    <Icon icon="ic:round-email" style={{ fontSize: 22, color: '#3b82f6' }} />
                                    <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>
                                        {reporte.envio?.exitosos?.length ?? 0}
                                    </div>
                                    <Text type="secondary" style={{ fontSize: 12 }}>Correos enviados</Text>
                                </Card>
                            </Col>

                            <Col xs={12} sm={6}>
                                <Card size="small" style={{ textAlign: 'center', background: '#fffbeb', border: '1px solid #fde68a' }}>
                                    <Icon icon="fluent:document-search-16-filled" style={{ fontSize: 20, color: '#f59e0b' }} />
                                    <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>
                                        {reporte.envio?.requieren_revision_manual?.length ?? 0}
                                    </div>
                                    <Text type="secondary" style={{ fontSize: 12 }}>Requieren revisión</Text>
                                </Card>
                            </Col>
                        </Row>

                        {reporte.envio?.requieren_revision_manual?.length > 0 && (
                            <div style={{ marginTop: 16, padding: 12, background: '#fffbeb', borderRadius: 8, border: '1px solid #fde68a' }}>
                                <Text strong style={{ fontSize: 13, color: '#92400e' }}>
                                    <Icon icon="fluent:document-search-16-filled" style={{ marginRight: 6 }} />
                                    Municipios que requieren revisión manual:
                                </Text>
                                <div style={{ marginTop: 8 }}>
                                    <Space size={[4, 4]} wrap>
                                        {reporte.envio.requieren_revision_manual.map((m) => (
                                            <Tag key={m.codigo} color="warning">{m.municipio}</Tag>
                                        ))}
                                    </Space>
                                </div>
                                <Button
                                    size="small"
                                    style={{ marginTop: 10 }}
                                    icon={<Icon icon="mdi:refresh" />}
                                    loading={!!reintentando.__todos__}
                                    onClick={manejarReintentarTodos}
                                >
                                    Reintentar todos
                                </Button>
                            </div>
                        )}
                    </Card>
                )}
            </div>
        </div>
    );
}

export default PanelMonitoreo;