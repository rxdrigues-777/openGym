# Este fork

Fork pessoal do openGym (AGPL-3.0) para rodar na Vercel + Supabase e conversar com um app de
Amazfit Bip 6. Mantido em https://github.com/rxdrigues-777/openGym.

## O que muda em relação ao upstream
- `api/vfs.js`, `api/remote-*.js`, `api/fsbridge.js`, `api/file-map.js`: disco virtual. Com
  `STORAGE_DRIVER=supabase`, os arquivos de `DATA_DIR` vivem na tabela `files` do Supabase.
  Sem a variável, tudo continua no disco como no upstream.
- `api/vercel-handler.js` + `deploy/vercel/`: a API como função da Vercel.
- `api/server.js`: só ganchos (import do `fs` via `fsbridge.js`, `reloadDb`, `handleRequest`
  exportado, `FileMap` para desafios e pareamentos, `listen` fora da Vercel).

## Limites conhecidos na Vercel
- Corpo de requisição até 4,5 MB (limite da Vercel). Um documento de estado maior que isso não
  sincroniza.
- Lembretes, push de fim de descanso, coach, uploads de mídia e audit log ficam desligados.
  Os `setInterval` do `server.js` continuam registrados (para não mexer no arquivo), mas não têm
  efeito: sem assinaturas de push não há lembrete a mandar, e qualquer gravação feita fora de uma
  requisição é descartada no próximo `begin()` do disco virtual.
- Painel admin enxerga só o que está no cache da requisição; pensado para uma pessoa.

## Deploy
- Supabase: rodar `deploy/supabase/001_files.sql` no projeto (região sa-east-1). O
  `900_spike_s6.sql` é só do spike S6 do relógio (tabela descartável, com limite).
- Vercel: projeto apontando para este repositório, **Root Directory = `deploy/vercel`**, com
  "Include files outside the Root Directory" ligado (padrão).
- Variáveis na Vercel: `STORAGE_DRIVER=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `SESSION_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `RP_ID`, `ORIGIN`, `RP_NAME=openGym`,
  `DATA_DIR=/data`, `COACH_DISABLED=1`, `MEDIA_UPLOADS=0`, `AUDIT_LOG=0`, `ALLOW_GUEST=0`,
  e opcionalmente `MEDIA_BASE`.
- Build local (`node deploy/vercel/build.mjs`, 2026-10-15): 243 MB e 13.196 arquivos com a mídia
  dos exercícios incluída.

## Atualizar a partir do upstream
    git fetch upstream && git merge upstream/main
Conflitos esperados só nos ganchos do `server.js` listados acima.

## Linha de base de testes (Windows)
`cd api && npm test` → 596 testes, 568 passam, 28 falham antes de qualquer mudança deste fork
(permissões POSIX, fim de linha CRLF e coach). Esses 28 não contam como regressão; a lista está
em `.baseline-api-failures.txt`.
