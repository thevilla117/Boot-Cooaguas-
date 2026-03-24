// Script de diagnóstico de la base de datos
// Ejecuta con: node test-db.js [codigo_cliente]
// Ejemplo: node test-db.js 59100

const { Pool } = require('pg');

const pool = new Pool({
    host: '192.168.1.66',
    user: 'admin',
    password: 'password123',
    database: 'cooaguas_db',
    port: 5432,
    connectionTimeoutMillis: 5000, // 5 segundos para conectar
});

const nuid = process.argv[2] || '120100'; // Usa el argumento o un valor por defecto

async function diagnosticar() {
    console.log('\n=========================================');
    console.log('  DIAGNÓSTICO DE BASE DE DATOS COOAGUAS');
    console.log('=========================================\n');

    let client;
    try {
        console.log(`🔌 Intentando conectar a 192.168.1.66:5432...`);
        client = await pool.connect();
        console.log('✅ CONEXIÓN EXITOSA\n');

        // 1. Ver tablas disponibles
        console.log('📋 Tablas disponibles en la base de datos:');
        const tablas = await client.query(`
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public' ORDER BY table_name;
        `);
        tablas.rows.forEach(r => console.log(`   - ${r.table_name}`));

        // 2. Ver columnas de la tabla clientes
        console.log('\n📋 Columnas de la tabla clientes:');
        const colsClientes = await client.query(`
            SELECT column_name, data_type FROM information_schema.columns
            WHERE table_name = 'clientes' ORDER BY ordinal_position;
        `);
        colsClientes.rows.forEach(r => console.log(`   - ${r.column_name} (${r.data_type})`));

        // 3. Ver columnas de la tabla facturas
        console.log('\n📋 Columnas de la tabla facturas:');
        const colsFacturas = await client.query(`
            SELECT column_name, data_type FROM information_schema.columns
            WHERE table_name = 'facturas' ORDER BY ordinal_position;
        `);
        colsFacturas.rows.forEach(r => console.log(`   - ${r.column_name} (${r.data_type})`));

        // 4. Buscar el NUID ingresado como texto y como número
        console.log(`\n🔍 Buscando NUID: "${nuid}" en tabla clientes...`);

        const busqueda = await client.query(
            `SELECT * FROM clientes WHERE nuid_contrato = $1 OR nuid_contrato::text = $2 LIMIT 3;`,
            [nuid, nuid]
        );

        if (busqueda.rows.length === 0) {
            console.log('❌ El NUID no fue encontrado en la tabla clientes.');
            console.log('   Verifique que el código sea correcto.');

            // Mostrar algunos ejemplos de NUID que sí existen
            const ejemplos = await client.query('SELECT nuid_contrato, nombre_completo FROM clientes LIMIT 5;');
            console.log('\n   Ejemplos de registros en clientes:');
            ejemplos.rows.forEach(r => console.log(`   - NUID: ${r.nuid_contrato} | Nombre: ${r.nombre_completo}`));
        } else {
            console.log(`✅ Cliente encontrado:`);
            console.log(busqueda.rows[0]);

            // 5. Probar la consulta del bot
            console.log('\n🔍 Ejecutando la consulta de facturas del bot...');
            const queryBot = `
                SELECT
                    c.nombre_completo,
                    c.direccion,
                    COALESCE(SUM(CASE WHEN f.estado != 'Pagada' THEN f.total_a_pagar ELSE 0 END), 0) AS total_deuda,
                    COUNT(CASE WHEN f.estado != 'Pagada' THEN 1 END)                                  AS facturas_pendientes,
                    MIN(CASE WHEN f.estado != 'Pagada' THEN f.fecha_pago_oportuno END)                AS fecha_pago_oportuno,
                    MAX(CASE WHEN f.estado != 'Pagada' THEN f.fecha_suspension END)                   AS fecha_suspension
                FROM clientes c
                LEFT JOIN facturas f ON c.nuid_contrato = f.nuid_contrato
                WHERE c.nuid_contrato = $1
                GROUP BY c.nombre_completo, c.direccion
            `;
            const resultBot = await client.query(queryBot, [nuid]);
            console.log(`✅ Resultado de la consulta del bot:`);
            console.log(resultBot.rows[0]);
        }

    } catch (err) {
        console.error('\n❌ ERROR:', err.message);
        if (err.code === 'ECONNREFUSED') {
            console.error('   No se pudo conectar al servidor. Verifique la IP y que el PostgreSQL esté encendido.');
        } else if (err.code === '28P01') {
            console.error('   Usuario o contraseña incorrectos.');
        } else if (err.code === '3D000') {
            console.error('   La base de datos "cooaguas_db" no existe.');
        } else if (err.code === '42P01') {
            console.error('   Una de las tablas (clientes o facturas) no existe.');
        }
    } finally {
        if (client) client.release();
        await pool.end();
        console.log('\n=========================================\n');
    }
}

diagnosticar();
