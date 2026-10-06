import { useState, useEffect } from 'react';
import { Layout, Button, Space, Typography, Avatar } from 'antd';
import { Icon } from '@iconify/react';
import Login from './pages/Login';
import PanelEjecucion from './pages/PanelEjecucion';
import PanelMonitoreo from './pages/PanelMonitoreo';
import PanelAdministracion from './pages/PanelAdministracion';
import PanelHistorial from './pages/PanelHistorial';
import PanelUsuarios from './pages/PanelUsuarios';
import { tokenValido } from './utils/token';

const { Header, Content } = Layout;
const { Text } = Typography;

function App() {
  const [usuario, setUsuario] = useState(() => {
    const token = localStorage.getItem('token');
    const guardado = localStorage.getItem('usuario');
    if (token && guardado && tokenValido(token)) {
      return JSON.parse(guardado);
    }
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    return null;
  });

  const [ejecucionActual, setEjecucionActual] = useState(() => {
    const guardada = localStorage.getItem('ejecucionActual');
    return guardada ? JSON.parse(guardada) : null;
  });

  const [vista, setVista] = useState('principal');

  useEffect(() => {
    if (!window.history.state?.vista) {
      window.history.replaceState({ vista: 'principal' }, '');
    }

    function manejarPopState(evento) {
      const vistaDestino = evento.state?.vista || 'principal';
      setVista(vistaDestino);
    }

    window.addEventListener('popstate', manejarPopState);
    return () => window.removeEventListener('popstate', manejarPopState);
  }, []);

  useEffect(() => {
    function manejarSesionExpirada() {
      cerrarSesion();
    }
    window.addEventListener('sesion-expirada', manejarSesionExpirada);

    const intervalo = setInterval(() => {
      const token = localStorage.getItem('token');
      if (!tokenValido(token)) {
        cerrarSesion();
      }
    }, 60000); 

    return () => {
      window.removeEventListener('sesion-expirada', manejarSesionExpirada);
      clearInterval(intervalo);
    };
  }, []);

  function navegarA(nuevaVista) {
    if (nuevaVista === vista) return;
    window.history.pushState({ vista: nuevaVista }, '');
    setVista(nuevaVista);
  }

  function volverAtras() {
    if (window.history.state?.vista && window.history.state.vista !== 'principal') {
      window.history.back();
    } else {
      navegarA('principal');
    }
  }

  function cerrarSesion() {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    window.history.replaceState({ vista: 'principal' }, '');
    setVista('principal');
    setUsuario(null);
  }

  function manejarEjecucionIniciada(id, mes, anio) {
    const nueva = { id, mes, anio };
    localStorage.setItem('ejecucionActual', JSON.stringify(nueva));
    setEjecucionActual(nueva);
  }

  function limpiarEjecucion() {
    localStorage.removeItem('ejecucionActual');
    setEjecucionActual(null);
  }

  if (!usuario) {
    return <Login onLoginExitoso={setUsuario} />;
  }

  const esAdministrador = usuario.rol === 'administrador';

  const vistaSegura = (!esAdministrador && (vista === 'correos' || vista === 'usuarios'))
    ? 'principal'
    : vista;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', borderBottom: '1px solid #e2e8f0' }}>
        <Space>
          <Avatar icon={<Icon icon="mdi:account-outline" />} />
          <Text>{usuario.nombre} <Text type="secondary">({usuario.rol})</Text></Text>
        </Space>

        <Space>
          {vistaSegura === 'principal' ? (
            <>
              <Button
                type="text"
                icon={<Icon icon="mdi:history" />}
                onClick={() => navegarA('historial')}
              >
                Historial
              </Button>
              {esAdministrador && (
                <>
                  <Button
                    type="text"
                    icon={<Icon icon="mdi:email-edit-outline" />}
                    onClick={() => navegarA('correos')}
                  >
                    Administración de correos
                  </Button>
                  <Button
                    type="text"
                    icon={<Icon icon="mdi:account-cog-outline" />}
                    onClick={() => navegarA('usuarios')}
                  >
                    Administración de usuarios
                  </Button>
                </>
              )}
            </>
          ) : (
            <Button
              type="text"
              icon={<Icon icon="mdi:arrow-left" />}
              onClick={volverAtras}
            >
              Volver
            </Button>
          )}
          <Button type="text" icon={<Icon icon="mdi:logout" />} onClick={cerrarSesion}>
            Cerrar sesión
          </Button>
        </Space>
      </Header>

      <Content>
        {vistaSegura === 'correos' ? (
          <PanelAdministracion />
        ) : vistaSegura === 'usuarios' ? (
          <PanelUsuarios />
        ) : vistaSegura === 'historial' ? (
          <PanelHistorial />
        ) : ejecucionActual ? (
          <PanelMonitoreo
            ejecucionId={ejecucionActual.id}
            mes={ejecucionActual.mes}
            anio={ejecucionActual.anio}
            onNuevaEjecucion={limpiarEjecucion}
            onEjecucionInvalida={limpiarEjecucion}
          />
        ) : (
          <PanelEjecucion onEjecucionIniciada={manejarEjecucionIniciada} />
        )}
      </Content>
    </Layout>
  );
}

export default App;