import { Table, Tag, Tooltip, Button } from 'antd';
import { Icon } from '@iconify/react';

const ESTATUS_DESCARGA_TAG = {
  exitoso: { color: 'success', texto: 'Descargado' },
  sin_resoluciones: { color: 'default', texto: 'Sin movimiento' },
  fallido: { color: 'error', texto: 'Fallido' },
};

const ESTATUS_ENVIO_TAG = {
  exitoso: { color: 'success', texto: 'Enviado' },
  fallido: { color: 'error', texto: 'Fallido' },
  omitido: { color: 'default', texto: 'Omitido' },
  requiere_revision_manual: { color: 'warning', texto: 'Revisión manual' },
};

function TablaEstadoMunicipios({ municipios, readOnly = true, reintentando = {}, onReintentar }) {
  const columnas = [
    {
      title: 'Municipio',
      dataIndex: 'nombre',
      key: 'nombre',
      sorter: (a, b) => (a.nombre || '').localeCompare(b.nombre || ''),
    },
    {
      title: 'Descarga',
      key: 'descarga',
      filters: Object.entries(ESTATUS_DESCARGA_TAG).map(([value, { texto }]) => ({ text: texto, value })),
      onFilter: (value, fila) => fila.descarga?.estatus === value,
      render: (_, fila) => {
        const info = fila.descarga ? ESTATUS_DESCARGA_TAG[fila.descarga.estatus] : null;
        if (!info) return <Tag color="default">—</Tag>;
        const tag = <Tag color={info.color}>{info.texto}</Tag>;
        return fila.descarga.error ? <Tooltip title={fila.descarga.error}>{tag}</Tooltip> : tag;
      },
    },
    {
      title: 'Envío',
      key: 'envio',
      filters: Object.entries(ESTATUS_ENVIO_TAG).map(([value, { texto }]) => ({ text: texto, value })),
      onFilter: (value, fila) => fila.envio?.estatus === value,
      render: (_, fila) => {
        const info = fila.envio ? ESTATUS_ENVIO_TAG[fila.envio.estatus] : null;
        if (!info) return <Tag color="default">—</Tag>;
        const tag = <Tag color={info.color}>{info.texto}</Tag>;
        return fila.envio.tipoError ? <Tooltip title={fila.envio.tipoError}>{tag}</Tooltip> : tag;
      },
    },
    {
      title: 'Intentos',
      key: 'intentos',
      align: 'center',
      render: (_, fila) => fila.envio?.intentosRegistrados ?? '—',
    },
  ];

  if (!readOnly) {
    columnas.push({
      title: '',
      key: 'acciones',
      align: 'center',
      render: (_, fila) =>
        fila.envio?.estatus === 'requiere_revision_manual' ? (
          <Button
            type="link"
            size="small"
            icon={<Icon icon="mdi:refresh" />}
            loading={!!reintentando[fila.codigoBcgs]}
            onClick={() => onReintentar?.(fila.codigoBcgs)}
          >
            Reintentar
          </Button>
        ) : null,
    });
  }

  return (
    <Table
      rowKey="municipioId"
      dataSource={municipios}
      columns={columnas}
      size="small"
      pagination={{ pageSize: 20, showSizeChanger: false }}
    />
  );
}

export default TablaEstadoMunicipios;