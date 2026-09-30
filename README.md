# Estudo Bass

Versão inicial do app de estudo de contrabaixo, feita como PWA mobile-first.

## O que já funciona

- Cadastro, edição e exclusão de músicas, separadas por Adolescentes, Jovens, Senhoras e Ministério de louvor.
- Tom, link de referência e letra com quebras de linha.
- Cadastro de várias frases por música, cada uma ligada a uma linha da letra.
- Braço clicável de cinco cordas, afinado em Si–Mi–Lá–Ré–Sol, casas 0 a 12, incluindo cordas soltas.
- O app desenha automaticamente os pontos, os nomes das notas e as setas da sequência.
- Dois jeitos de organizar o estudo: letra completa com rolagem e marcação de linhas, ou chamadas curtas cadastradas na ordem da música, cada uma com seu desenho.
- Dados salvos no armazenamento local do navegador.
- Importação e exportação de cópia JSON.
- Cache offline do app depois de carregado por localhost ou HTTPS.

## Privacidade e cópia de segurança

Não há conta nem servidor de dados nesta versão. As músicas ficam no armazenamento do navegador neste aparelho. Use Exportar cópia para guardar um arquivo de backup; restaurá-lo em outro navegador exige Importar cópia.

O link do YouTube é apenas uma referência. A letra é colada ou digitada pelo usuário.

## Instalar no iPhone

Depois da publicação em HTTPS, abra o endereço do app no Safari, toque em Compartilhar, escolha Adicionar à Tela de Início, ative Abrir como App e toque em Adicionar. Na primeira abertura com internet, o app baixa os arquivos para uso offline.

Para levar o repertório do computador ao iPhone, use Exportar cópia no navegador de origem e Importar cópia no app instalado. Cada aparelho mantém seus próprios dados.

## Abrir localmente

Abra index.html para uma prévia local. Para testar instalação e uso offline, sirva a pasta por localhost ou HTTPS, porque navegadores não habilitam Service Worker em file://.
