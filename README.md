# Barbearia Prime

Site de barbearia com:

- galeria de fotos para cortes e barba
- selecao de servicos em formato de carrinho
- visualizacao de horarios livres e ocupados
- agendamento com integracao preparada para Google Agenda

## Estrutura

- `frontend`: React + Vite
- `backend`: Express + Google Calendar API

## Como rodar

### Backend

1. Entre em `C:\dev\barbershop\backend`
2. Instale as dependencias com `npm install`
3. Copie `.env.example` para `.env`
4. Rode `npm run dev`

### Frontend

1. Entre em `C:\dev\barbershop\frontend`
2. Instale as dependencias com `npm install`
3. Copie `.env.example` para `.env`
4. Ajuste `VITE_API_URL` se necessario
5. Rode `npm run dev`

## Deploy com Railway e Vercel

### Backend no Railway

1. Crie um projeto no Railway com o repo do GitHub
2. Defina o `Root Directory` como `backend`
3. Configure as variaveis:

- `PORT=3333`
- `FRONTEND_URL=https://SEU_FRONTEND.vercel.app`
- `GOOGLE_CALENDAR_ID=eh0478033@gmail.com`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL=barbearia-calendar@barbearia-calendar-491520.iam.gserviceaccount.com`
- `GOOGLE_PRIVATE_KEY="SUA_CHAVE"`

### Frontend no Vercel

1. Importe o mesmo repo no Vercel
2. Defina o `Root Directory` como `frontend`
3. Configure a variavel:

- `VITE_API_URL=https://SEU_BACKEND.up.railway.app/api`

## Google Agenda

O backend ja funciona em modo demonstracao mesmo sem Google configurado. Nesse modo:

- a agenda mostra horarios ocupados salvos localmente em memoria
- novos agendamentos entram na lista enquanto o servidor estiver ligado

Para sincronizar de verdade com o Google Agenda:

1. Crie um projeto no Google Cloud
2. Ative a Google Calendar API
3. Gere uma conta de servico
4. Compartilhe a agenda do barbeiro com o email dessa conta de servico
5. Preencha no `.env`:

- `GOOGLE_CALENDAR_ID`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`

## Observacao

Hoje os agendamentos locais ficam em memoria. Se voce quiser, no proximo passo eu posso conectar isso a um banco de dados para nao perder as reservas quando o backend reiniciar.
