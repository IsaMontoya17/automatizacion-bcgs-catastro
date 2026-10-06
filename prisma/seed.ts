import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const MUNICIPIOS: { codigo: string; nombre: string }[] = [
  { codigo: '129', nombre: 'CALDAS' },
  { codigo: '360', nombre: 'ITAGUÍ' },
  { codigo: '376', nombre: 'LA CEJA' },
  { codigo: '002', nombre: 'ABEJORRAL' },
  { codigo: '030', nombre: 'AMAGA' },
  { codigo: '004', nombre: 'ABRIAQUÍ' },
  { codigo: '021', nombre: 'ALEJANDRÍA' },
  { codigo: '031', nombre: 'AMALFI' },
  { codigo: '034', nombre: 'ANDES' },
  { codigo: '036', nombre: 'ANGELÓPOLIS' },
  { codigo: '038', nombre: 'ANGOSTURA' },
  { codigo: '040', nombre: 'ANORÍ' },
  { codigo: '044', nombre: 'ANZÁ' },
  { codigo: '045', nombre: 'APARTADÓ' },
  { codigo: '051', nombre: 'ARBOLETES' },
  { codigo: '055', nombre: 'ARGELIA' },
  { codigo: '059', nombre: 'ARMENIA' },
  { codigo: '086', nombre: 'BELMIRA' },
  { codigo: '091', nombre: 'BETANIA' },
  { codigo: '093', nombre: 'BETULIA' },
  { codigo: '107', nombre: 'BRICEÑO' },
  { codigo: '113', nombre: 'BURITICÁ' },
  { codigo: '125', nombre: 'CAICEDO' },
  { codigo: '134', nombre: 'CAMPAMENTO' },
  { codigo: '142', nombre: 'CARACOLÍ' },
  { codigo: '145', nombre: 'CARAMANTA' },
  { codigo: '147', nombre: 'CAREPA' },
  { codigo: '150', nombre: 'CAROLINA DEL PRINCIPE' },
  { codigo: '154', nombre: 'CAUCASIA' },
  { codigo: '138', nombre: 'CAÑASGORDAS' },
  { codigo: '172', nombre: 'CHIGORODÓ' },
  { codigo: '190', nombre: 'CISNEROS' },
  { codigo: '101', nombre: 'CIUDAD BOLÍVAR' },
  { codigo: '197', nombre: 'COCORNÁ' },
  { codigo: '206', nombre: 'CONCEPCIÓN' },
  { codigo: '209', nombre: 'CONCORDIA' },
  { codigo: '120', nombre: 'CÁCERES' },
  { codigo: '234', nombre: 'DABEIBA' },
  { codigo: '237', nombre: 'DON MATÍAS' },
  { codigo: '240', nombre: 'EBÉJICO' },
  { codigo: '250', nombre: 'EL BAGRE' },
  { codigo: '148', nombre: 'EL CÁRMEN DE VIBORAL' },
  { codigo: '541', nombre: 'EL PEÑOL' },
  { codigo: '697', nombre: 'EL SANTUARIO' },
  { codigo: '264', nombre: 'ENTRERRIOS' },
  { codigo: '282', nombre: 'FREDONIA' },
  { codigo: '284', nombre: 'FRONTINO' },
  { codigo: '306', nombre: 'GIRALDO' },
  { codigo: '313', nombre: 'GRANADA' },
  { codigo: '315', nombre: 'GUADALUPE' },
  { codigo: '318', nombre: 'GUARNE' },
  { codigo: '321', nombre: 'GUATAPÉ' },
  { codigo: '310', nombre: 'GÓMEZ PLATA' },
  { codigo: '347', nombre: 'HELICONIA' },
  { codigo: '353', nombre: 'HISPANIA' },
  { codigo: '361', nombre: 'ITUANGO' },
  { codigo: '364', nombre: 'JARDÍN' },
  { codigo: '368', nombre: 'JERICÓ' },
  { codigo: '390', nombre: 'LA PINTADA' },
  { codigo: '400', nombre: 'LA UNIÓN' },
  { codigo: '411', nombre: 'LIBORINA' },
  { codigo: '425', nombre: 'MACEO' },
  { codigo: '467', nombre: 'MONTEBELLO' },
  { codigo: '475', nombre: 'MURINDO' },
  { codigo: '480', nombre: 'MUTATÁ' },
  { codigo: '483', nombre: 'NARIÑO' },
  { codigo: '495', nombre: 'NECHÍ' },
  { codigo: '490', nombre: 'NECOCLÍ' },
  { codigo: '501', nombre: 'OLAYA' },
  { codigo: '543', nombre: 'PEQUE' },
  { codigo: '576', nombre: 'PUEBLORRICO' },
  { codigo: '579', nombre: 'PUERTO BERRIO' },
  { codigo: '585', nombre: 'PUERTO NARE' },
  { codigo: '591', nombre: 'PUERTO TRIUNFO' },
  { codigo: '604', nombre: 'REMEDIOS' },
  { codigo: '628', nombre: 'SABANALARGA' },
  { codigo: '642', nombre: 'SALGAR' },
  { codigo: '647', nombre: 'SAN ANDRES DE CUERQUIA' },
  { codigo: '649', nombre: 'SAN CARLOS' },
  { codigo: '652', nombre: 'SAN FRANCISCO' },
  { codigo: '656', nombre: 'SAN JERONIMO' },
  { codigo: '658', nombre: 'SAN JOSÉ DE LA MONTAÑA' },
  { codigo: '659', nombre: 'SAN JUAN DE URABÁ' },
  { codigo: '660', nombre: 'SAN LUIS' },
  { codigo: '664', nombre: 'SAN PEDRO DE LOS MILAGROS' },
  { codigo: '665', nombre: 'SAN PEDRO DE URABÁ' },
  { codigo: '667', nombre: 'SAN RAFAEL' },
  { codigo: '670', nombre: 'SAN ROQUE' },
  { codigo: '679', nombre: 'SANTA BÁRBARA' },
  { codigo: '042', nombre: 'SANTA FE DE ANTIOQUIA' },
  { codigo: '686', nombre: 'SANTA ROSA DE OSOS' },
  { codigo: '690', nombre: 'SANTO DOMINGO' },
  { codigo: '736', nombre: 'SEGOVIA' },
  { codigo: '756', nombre: 'SONSÓN' },
  { codigo: '761', nombre: 'SOPETRÁN' },
  { codigo: '790', nombre: 'TARAZÁ' },
  { codigo: '792', nombre: 'TARSO' },
  { codigo: '809', nombre: 'TITIRIBÍ' },
  { codigo: '819', nombre: 'TOLEDO' },
  { codigo: '837', nombre: 'TURBO' },
  { codigo: '789', nombre: 'TÁMESIS' },
  { codigo: '842', nombre: 'URAMITA' },
  { codigo: '847', nombre: 'URRAO' },
  { codigo: '854', nombre: 'VALDIVIA' },
  { codigo: '856', nombre: 'VALPARAÍSO' },
  { codigo: '858', nombre: 'VEGACHÍ' },
  { codigo: '861', nombre: 'VENECIA' },
  { codigo: '873', nombre: 'VIGÍA DEL FUERTE' },
  { codigo: '885', nombre: 'YALÍ' },
  { codigo: '887', nombre: 'YARUMAL' },
  { codigo: '890', nombre: 'YOLOMBÓ' },
  { codigo: '893', nombre: 'YONDÓ' },
  { codigo: '895', nombre: 'ZARAGOZA' },
];

const PLANTILLA_POR_DEFECTO = {
  asunto: 'Entrega de los movimientos generados en el mes de {mes} de {anio} en el municipio de {municipio}',
  cuerpo:
    '{saludo},\n\n' +
    'De acuerdo con el artículo 10 de la resolución 746 del 2024 del IGAC, se adjuntan los movimientos ' +
    'realizados en el municipio durante el mes de {mes} de {anio}.\n\n' +
    'Cordialmente,\n\n' +
    'LUDWYG LONDOÑO\n' +
    'Profesional Especializado\n' +
    'Gerencia de Catastro - Gobernación de Antioquia',
};

async function sembrarUsuarioAdmin() {
  const claveHasheada = await bcrypt.hash('AdminCatastro2026*', 10);

  const admin = await prisma.usuario.upsert({
    where: { usuario: 'admin' },
    update: {},
    create: {
      nombre: 'Isabela Montoya Alarcón',
      usuario: 'admin',
      passwordHash: claveHasheada,
      rol: 'administrador',
    },
  });

  console.log(`✓ Usuario verificado/creado: ${admin.usuario}`);
}

async function sembrarMunicipios() {
  for (const { codigo, nombre } of MUNICIPIOS) {
    await prisma.municipio.upsert({
      where: { codigoBcgs: codigo },
      update: { nombre },
      create: { codigoBcgs: codigo, nombre },
    });
  }

  console.log(`✓ ${MUNICIPIOS.length} municipios sembrados/verificados.`);
}

async function sembrarPlantillaCorreo() {
  const existente = await prisma.plantillaCorreo.findFirst();

  if (existente) {
    console.log('✓ Ya existe una plantilla de correo en la base de datos. No se modifica.');
    return;
  }

  await prisma.plantillaCorreo.create({ data: PLANTILLA_POR_DEFECTO });
  console.log('✓ Plantilla de correo por defecto creada.');
}

async function main() {
  await sembrarUsuarioAdmin();
  await sembrarMunicipios();
  await sembrarPlantillaCorreo();
}

main()
  .catch((e) => {
    console.error('Error al sembrar la base de datos:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });