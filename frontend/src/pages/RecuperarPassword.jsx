import { useState } from 'react';
import { Form, Input, Button, Alert, Typography } from 'antd';
import { Icon } from '@iconify/react';
import { solicitarRecuperacion, restablecerPassword } from '../api/client';

const { Text } = Typography;

function RecuperarPassword({ onVolver }) {
  const [paso, setPaso] = useState('solicitar'); // 'solicitar' | 'restablecer' | 'listo'
  const [identificador, setIdentificador] = useState('');
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [cargando, setCargando] = useState(false);
  const [reenviando, setReenviando] = useState(false);

  async function manejarSolicitud({ identificador: valor }) {
    setError('');
    setCargando(true);
    try {
      const data = await solicitarRecuperacion(valor.trim());
      setIdentificador(valor.trim());
      setAviso(data.mensaje);
      setPaso('restablecer');
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  async function reenviarCodigo() {
    setError('');
    setReenviando(true);
    try {
      const data = await solicitarRecuperacion(identificador);
      setAviso(data.mensaje);
    } catch (err) {
      setError(err.message);
    } finally {
      setReenviando(false);
    }
  }

  async function manejarRestablecer({ codigo, nuevaPassword }) {
    setError('');
    setCargando(true);
    try {
      await restablecerPassword(identificador, codigo.trim(), nuevaPassword);
      setPaso('listo');
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  if (paso === 'listo') {
    return (
      <>
        <Alert
          type="success"
          showIcon
          message="Contraseña actualizada"
          description="Ya puedes iniciar sesión con tu nueva contraseña."
          style={{ marginBottom: 16 }}
        />
        <Button type="primary" block size="large" onClick={onVolver}>
          Volver a iniciar sesión
        </Button>
      </>
    );
  }

  return (
    <>
      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      {paso === 'solicitar' && (
        <>
          <Text style={{ display: 'block', marginBottom: 16 }}>
            Escribe tu usuario o el correo asociado a tu cuenta. Te enviaremos un código de 6 dígitos para
            crear una nueva contraseña.
          </Text>

          <Form layout="vertical" onFinish={manejarSolicitud}>
            <Form.Item
              label="Usuario o correo"
              name="identificador"
              rules={[{ required: true, message: 'Ingresa tu usuario o correo' }]}
            >
              <Input prefix={<Icon icon="mdi:account-outline" />} size="large" />
            </Form.Item>

            <Button type="primary" htmlType="submit" loading={cargando} block size="large">
              Enviar código
            </Button>
          </Form>
        </>
      )}

      {paso === 'restablecer' && (
        <>
          {aviso && <Alert type="info" message={aviso} showIcon style={{ marginBottom: 16 }} />}

          <Form layout="vertical" onFinish={manejarRestablecer}>
            <Form.Item
              label="Código de verificación"
              name="codigo"
              rules={[
                { required: true, message: 'Ingresa el código que recibiste' },
                { pattern: /^\d{6}$/, message: 'El código tiene 6 dígitos' },
              ]}
            >
              <Input
                prefix={<Icon icon="mdi:shield-key-outline" />}
                size="large"
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
              />
            </Form.Item>

            <Form.Item
              label="Nueva contraseña"
              name="nuevaPassword"
              rules={[
                { required: true, message: 'Ingresa la nueva contraseña' },
                { min: 8, message: 'Debe tener al menos 8 caracteres' },
              ]}
              hasFeedback
            >
              <Input.Password prefix={<Icon icon="mdi:lock-outline" />} size="large" />
            </Form.Item>

            <Form.Item
              label="Confirmar contraseña"
              name="confirmarPassword"
              dependencies={['nuevaPassword']}
              hasFeedback
              rules={[
                { required: true, message: 'Confirma la nueva contraseña' },
                ({ getFieldValue }) => ({
                  validator(_, valor) {
                    if (!valor || getFieldValue('nuevaPassword') === valor) return Promise.resolve();
                    return Promise.reject(new Error('Las contraseñas no coinciden'));
                  },
                }),
              ]}
            >
              <Input.Password prefix={<Icon icon="mdi:lock-check-outline" />} size="large" />
            </Form.Item>

            <Button type="primary" htmlType="submit" loading={cargando} block size="large">
              Cambiar contraseña
            </Button>
          </Form>

          <Button type="link" block loading={reenviando} onClick={reenviarCodigo} style={{ marginTop: 8 }}>
            No me llegó el código, enviarlo de nuevo
          </Button>
        </>
      )}

      <Button type="link" block onClick={onVolver} icon={<Icon icon="mdi:arrow-left" />}>
        Volver al inicio de sesión
      </Button>
    </>
  );
}

export default RecuperarPassword;