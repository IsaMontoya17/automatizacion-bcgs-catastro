import { useState } from 'react';
import { Card, Select, Button, Alert, Typography, Row, Col } from 'antd';
import { Icon } from '@iconify/react';
import { iniciarDescarga } from '../api/client';

const { Title, Text } = Typography;

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const ANIO_ACTUAL = new Date().getFullYear();
const ANIOS = [ANIO_ACTUAL - 1, ANIO_ACTUAL, ANIO_ACTUAL + 1];

function PanelEjecucion({ onEjecucionIniciada }) {
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [anio, setAnio] = useState(ANIO_ACTUAL);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  async function manejarEjecutar() {
    setError('');
    setCargando(true);

    try {
      const { id } = await iniciarDescarga(mes, anio);
      onEjecucionIniciada(id, mes, anio);
    } catch (err) {
      setError(err.message);
      setCargando(false);
    }
  }

  return (
    <div style={{ minHeight: 'calc(100vh - 64px)', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <Card style={{ width: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <Icon icon="famicons:calendar" style={{ fontSize: 32, marginBottom: 8, display: 'inline-block' }} />
          <Title level={4} style={{ marginBottom: 4 }}>
            Descarga y envío de resoluciones
          </Title>
          <Text type="secondary">Selecciona el periodo que deseas procesar.</Text>
        </div>

        {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

        <Row gutter={16}>
          <Col span={12}>
            <Text strong>Mes</Text>
            <Select
              value={mes}
              onChange={setMes}
              style={{ width: '100%', marginTop: 4 }}
              size="large"
              options={MESES.map((nombre, i) => ({ value: i + 1, label: nombre }))}
            />
          </Col>
          <Col span={12}>
            <Text strong>Año</Text>
            <Select
              value={anio}
              onChange={setAnio}
              style={{ width: '100%', marginTop: 4 }}
              size="large"
              options={ANIOS.map((a) => ({ value: a, label: a }))}
            />
          </Col>
        </Row>

        <Button
          type="primary"
          size="large"
          block
          loading={cargando}
          onClick={manejarEjecutar}
          icon={<Icon icon="mdi:play-circle-outline" />}
          style={{ marginTop: 24 }}
        >
          Ejecutar
        </Button>
      </Card>
    </div>
  );
}

export default PanelEjecucion;