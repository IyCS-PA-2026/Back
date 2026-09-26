# Backend — Sistema de Gestión de Productos e Inventario

API del Proyecto 1 de Ingeniería y Calidad de Software (Grupo 5). NestJS + TypeScript + MySQL (TypeORM).
El frontend está en el repositorio [Front](https://github.com/IyCS-PA-2026/Front).

La rama de trabajo integrada es **`develop`** (contiene CR-001 a CR-007).

---

## Requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (corriendo)
- Git

No hace falta instalar Node ni Yarn: todo corre dentro de los contenedores.

---

## Cómo correr el proyecto

### 1. Clonar los dos repositorios en la misma carpeta

```bash
git clone -b develop https://github.com/IyCS-PA-2026/Back.git
git clone -b develop https://github.com/IyCS-PA-2026/Front.git
```

### 2. Crear el archivo `.env`

En `Back/proyecto/` crear un archivo `.env` (no se sube al repo). Para trabajar con el MySQL del `docker-compose`:

```env
DB_TYPE=mysql
DB_HOST=mysql
DB_PORT=3306
DB_USERNAME=admin
DB_PASSWORD=admin
DB_DATABASE=proyecto
DB_SSL=false

PORT=3000
JWT_SECRET=<pedir al equipo>
JWT_EXPIRATION_ACCESS=1h
JWT_EXPIRATION_REFRESH=7d
PUNTO_VENTA_ACTIVO_ID=2
```

- `DB_HOST=mysql` es el nombre del servicio en el `docker-compose`, no `localhost`.
- Opcionales: `GOOGLE_CLIENT_ID` (login con Google) y `EMAIL_USER` / `EMAIL_PASS` (envío de mails).

### 3. Levantar los contenedores

```bash
cd Back/proyecto
docker compose up -d --build
```

Levanta tres servicios:

| Servicio | Contenedor | URL / puerto |
|---|---|---|
| API (NestJS, modo watch) | `proyecto-backend` | http://localhost:3000/api (Swagger en la misma URL) |
| MySQL 8 | `proyecto-db` | `localhost:3310` (usuario `admin` / `admin`, base `proyecto`) |
| phpMyAdmin | `proyecto-phpmyadmin` | http://localhost:8081 |

La primera vez tarda unos minutos (instala dependencias). Para ver cuándo terminó de arrancar:

```bash
docker logs -f proyecto-backend
```

Cuando aparece `Nest application successfully started`, la API está lista. Los cambios en `src/` se recargan solos.

> **Base de datos:** `app.module.ts` usa `synchronize: true`, así que TypeORM crea y actualiza las tablas al arrancar. No hace falta correr migraciones para trabajar en local.

### 4. Cargar los datos iniciales (solo la primera vez)

Con la API levantada, abrir en el navegador:

```
http://localhost:3000/api/seed-all/execute
```

Crea roles, empresas, líneas y los usuarios de prueba. Es idempotente, se puede volver a ejecutar sin problema.

### 5. Levantar el frontend

Ver el [README del Front](https://github.com/IyCS-PA-2026/Front#readme). Usuario para ingresar: `admin@gmail.com` / `admin123`.

---

## Tests

Los tests corren dentro del contenedor del backend:

```bash
# Todos (tarda varios minutos)
docker exec proyecto-backend npx jest --coverage=false

# Solo un módulo o archivo
docker exec proyecto-backend npx jest src/modules/gestion-productos --coverage=false
docker exec proyecto-backend npx jest historial-precio --coverage=false
```

Hay 25 suites heredadas del sistema original (specs autogenerados de Nest del tipo "should be defined", sin mocks) que fallan desde antes de los CR. Todas las suites de los CR pasan.

---

## Comandos útiles

```bash
docker compose ps                          # estado de los contenedores
docker compose stop                        # apagar (conserva la base)
docker compose up -d                       # volver a prender
docker compose restart backend             # reiniciar solo la API
docker compose up -d --build -V backend    # reconstruir la API tras cambios en package.json
docker exec -it proyecto-backend sh        # abrir una terminal dentro del contenedor
```

- `-V` recrea solo el volumen de `node_modules`; la base de datos (volumen `mysql_data`) se conserva.
- **Cuidado:** `docker compose down -v` borra también la base de datos.

### Problemas comunes

| Problema | Solución |
|---|---|
| `error during connect ... dockerDesktopLinuxEngine` | Docker Desktop no está abierto. |
| El puerto 3000, 3310 u 8081 está ocupado | Cerrar el otro programa o cambiar el puerto izquierdo en `docker-compose.yml`. |
| La API no conecta a la base | Revisar que el `.env` tenga `DB_HOST=mysql` y `DB_PORT=3306`. |
| Error por dependencias después de un `git pull` | `docker compose up -d --build -V backend` |

---

## Estructura

```
Back/
└── proyecto/
    ├── src/
    │   ├── main.ts                 # Bootstrap (prefijo /api, Swagger, ValidationPipe)
    │   ├── app.module.ts           # Módulo raíz y conexión TypeORM
    │   ├── migrations/             # Migraciones (Init, SuperLínea, Presentación, HistorialPrecio)
    │   └── modules/
    │       ├── gestion-productos/  # Producto, Marca, Línea, SuperLínea (núcleo de los CR)
    │       ├── gestion-usuario/    # Usuarios, autenticación JWT, roles
    │       ├── organizacion/       # Clientes, proveedores, empresas, personal
    │       ├── gutil/              # Provincias, localidades, IVA
    │       └── common/             # Seeds, filtros, pipes, decoradores
    ├── docs/                       # Documentación de cada CR
    ├── docker-compose.yml
    ├── Dockerfile
    └── .env                        # (local, no se sube)
```

Cada módulo sigue la misma convención:

```
modulo/
├── domain/            # Entidades, value objects, servicios de dominio, interfaces de repositorio
├── application/       # Controllers y servicios de aplicación
├── infraestructure/   # Repositorios y adapters de persistencia
├── dto/
└── *.module.ts
```

## Stack

NestJS 11 · TypeScript 5.7 · MySQL 8 + TypeORM 0.3 · JWT · Swagger · Jest + Supertest · Docker Compose

## Convenciones

- Módulos y archivos en kebab-case; clases y entidades en PascalCase; tablas en snake_case.
- DTOs validados con `class-validator` y `ValidationPipe` con `whitelist` y `forbidNonWhitelisted`: un campo que no está en el DTO devuelve 400.
- Todos los endpoints tienen el prefijo `/api`.
