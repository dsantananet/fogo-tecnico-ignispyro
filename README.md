# Fogo Técnico — Made by IgnisPyro

Aplicação para recolha documental de ações de fogo controlado e queimadas extensivas. **Não é um sistema oficial ICNF, nem ferramenta de decisão de ignição, meteorologia previsional ou autorização de queimas.**

## Funcionalidades da versão 2.1

- Dashboard local de ações, parcelas, área e horas-parcela por ano, com arquivo e cópia JSON privada. Os cálculos não são horas-homem.
- Formulário para identificação da ação e várias parcelas, responsáveis, técnicos/OPQ e meios.
- Registo meteorológico por parcela e por observação; exportação/partilha de CSV.
- Se *queimada extensiva*, exportação do registo Excel. Se *fogo controlado*, exportação Excel e impressão do POQ.
- POQ de execução gerado em HTML para impressão em PDF, com secções de intervenientes, meteorologia, combustível, problemas, efeitos, eficácia e fotografia. Não é uma reprodução 1:1 de todos os modelos de livro.
- Importação de cópia de dados JSON e atualização de uma **cópia** `.xlsx` selecionada localmente. `.xlsm` não é editado para preservar macros.
- Identidade visual IgnisPyro e funcionamento offline da PWA após instalação HTTPS.

## Limitações antes da utilização em produção

- Sem Google OAuth ou gravação automática no Drive; exportar e partilhar manualmente.
- Não cria mapas georreferenciados a partir de KMZ; o mapa deve ser anexado como imagem.
- Fotos e mapas não persistem nas cópias JSON; o utilizador deve arquivar os originais.
- Rever layout, paginação e preenchimento POQ/Excel e validar credenciações e competências antes de arquivo oficial.
- Dados ficam no armazenamento local do navegador; limpar dados do browser elimina os registos locais.
- Os dados da operação real e credenciais pessoais **não são distribuídos neste repositório**.

## Executar localmente

```bash
cd app
python -m http.server 8080
```

Abrir `http://localhost:8080`. Para instalar no Android, publicar `app/` via HTTPS e escolher **Instalar aplicação** no menu do Chrome.

## Android

A aplicação Android usa Capacitor para executar localmente a mesma interface da versão web.
Os ficheiros são guardados no destino escolhido pelo utilizador e o POQ usa a impressão do Android.

O instalador assinado é disponibilizado na secção [Releases](https://github.com/dsantananet/fogo-tecnico-ignispyro/releases). As instruções de compilação e instalação estão em [BUILD_ANDROID.md](BUILD_ANDROID.md).

## Licenciamento e identidade

Código disponibilizado para auditoria e colaboração técnica. Logótipo e marca «IgnisPyro» identificam a autoria; não implicam associação institucional ao ICNF. As licenças de código e marca devem ser decididas antes de publicação definitiva.
