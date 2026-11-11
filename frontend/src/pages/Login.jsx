import { useState } from 'react';
import { Form, Input, Button, Card, Alert, Typography, Divider } from 'antd';
import { Icon } from '@iconify/react';
import { login } from '../api/client';
import RecuperarPassword from './RecuperarPassword';

const { Title, Text } = Typography;

function Login({ onLoginExitoso }) {
  const [modo, setModo] = useState('login'); // 'login' | 'recuperar'
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  async function manejarSubmit({ usuario, password }) {
    setError('');
    setCargando(true);

    try {
      const data = await login(usuario, password);
      localStorage.setItem('token', data.token);
      localStorage.setItem('usuario', JSON.stringify(data.usuario));
      onLoginExitoso(data.usuario);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  function cambiarModo(nuevoModo) {
    setError('');
    setModo(nuevoModo);
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9' }}>
      <Card style={{ width: 420 }}>
        <Title level={4} style={{ marginBottom: 0, textAlign: 'center' }}>
          {modo === 'login' ? 'Automatización de Resoluciones Catastrales' : 'Restablecer contraseña'}
        </Title>
        <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginTop: 4 }}>
          Gerencia de Catastro — Gobernación de Antioquia
        </Text>
        {modo === 'login' && (
          <Text type="secondary" style={{ display: 'block', textAlign: 'center', fontSize: 12, marginTop: 2 }}>
            Descarga, organización y envío masivo de resoluciones a los 113 municipios
          </Text>
        )}

        <Divider style={{ margin: '20px 0' }} />

        {modo === 'recuperar' ? (
          <RecuperarPassword onVolver={() => cambiarModo('login')} />
        ) : (
          <>
            {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

            <Form layout="vertical" onFinish={manejarSubmit}>
              <Form.Item label="Usuario" name="usuario" rules={[{ required: true, message: 'Ingresa tu usuario' }]}>
                <Input prefix={<Icon icon="mdi:account-outline" />} size="large" />
              </Form.Item>

              <Form.Item
                label="Contraseña"
                name="password"
                rules={[{ required: true, message: 'Ingresa tu contraseña' }]}
                style={{ marginBottom: 8 }}
              >
                <Input.Password prefix={<Icon icon="mdi:lock-outline" />} size="large" />
              </Form.Item>

              <div style={{ textAlign: 'right', marginBottom: 16 }}>
                <Button type="link" style={{ padding: 0 }} onClick={() => cambiarModo('recuperar')}>
                  ¿Olvidaste tu contraseña?
                </Button>
              </div>

              <Button type="primary" htmlType="submit" loading={cargando} block size="large">
                Iniciar sesión
              </Button>
            </Form>
          </>
        )}
      </Card>
    </div>
  );
}

export default Login;