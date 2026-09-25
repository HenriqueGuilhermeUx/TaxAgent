export interface MetropolitanRegionDefinition {
  slug: string;
  name: string;
  state: string;
  sourceUrl: string;
  municipalities: string[];
}

export const METROPOLITAN_REGIONS: MetropolitanRegionDefinition[] = [
  {
    slug: 'sao-paulo',
    name: 'Região Metropolitana de São Paulo',
    state: 'SP',
    sourceUrl: 'https://habitacao.sp.gov.br/habitacao/servicos/informacoes/regiao-metropolitana-de-sao-paulo',
    municipalities: [
      'Arujá', 'Barueri', 'Biritiba-Mirim', 'Caieiras', 'Cajamar', 'Carapicuíba', 'Cotia', 'Diadema',
      'Embu das Artes', 'Embu-Guaçu', 'Ferraz de Vasconcelos', 'Francisco Morato', 'Franco da Rocha',
      'Guararema', 'Guarulhos', 'Itapevi', 'Itapecerica da Serra', 'Itaquaquecetuba', 'Jandira', 'Juquitiba',
      'Mairiporã', 'Mauá', 'Mogi das Cruzes', 'Osasco', 'Pirapora do Bom Jesus', 'Poá', 'Ribeirão Pires',
      'Rio Grande da Serra', 'Salesópolis', 'Santa Isabel', 'Santana de Parnaíba', 'Santo André',
      'São Bernardo do Campo', 'São Caetano do Sul', 'São Lourenço da Serra', 'São Paulo', 'Suzano',
      'Taboão da Serra', 'Vargem Grande Paulista',
    ],
  },
  {
    slug: 'belo-horizonte',
    name: 'Região Metropolitana de Belo Horizonte',
    state: 'MG',
    sourceUrl: 'https://www.agenciarmbh.mg.gov.br/rmbh/',
    municipalities: [
      'Baldim', 'Belo Horizonte', 'Betim', 'Brumadinho', 'Caeté', 'Capim Branco', 'Confins', 'Contagem',
      'Esmeraldas', 'Florestal', 'Ibirité', 'Igarapé', 'Itaguara', 'Itatiaiuçu', 'Jaboticatubas', 'Juatuba',
      'Lagoa Santa', 'Mário Campos', 'Mateus Leme', 'Matozinhos', 'Nova Lima', 'Nova União', 'Pedro Leopoldo',
      'Raposos', 'Ribeirão das Neves', 'Rio Acima', 'Rio Manso', 'Sabará', 'Santa Luzia', 'São Joaquim de Bicas',
      'São José da Lapa', 'Sarzedo', 'Taquaraçu de Minas', 'Vespasiano',
    ],
  },
  {
    slug: 'rio-de-janeiro',
    name: 'Região Metropolitana do Rio de Janeiro',
    state: 'RJ',
    sourceUrl: 'https://www.rj.gov.br/irm/formacao_rjrm',
    municipalities: [
      'Belford Roxo', 'Cachoeiras de Macacu', 'Duque de Caxias', 'Guapimirim', 'Itaboraí', 'Itaguaí', 'Japeri',
      'Magé', 'Maricá', 'Mesquita', 'Nilópolis', 'Niterói', 'Nova Iguaçu', 'Paracambi', 'Petrópolis', 'Queimados',
      'Rio Bonito', 'Rio de Janeiro', 'São Gonçalo', 'São João de Meriti', 'Seropédica', 'Tanguá',
    ],
  },
  {
    slug: 'curitiba',
    name: 'Região Metropolitana de Curitiba',
    state: 'PR',
    sourceUrl: 'https://www.amep.pr.gov.br/Pagina/Sobre-RM-de-Curitiba',
    municipalities: [
      'Curitiba', 'Adrianópolis', 'Agudos do Sul', 'Almirante Tamandaré', 'Araucária', 'Balsa Nova',
      'Bocaiúva do Sul', 'Campina Grande do Sul', 'Campo do Tenente', 'Campo Largo', 'Campo Magro', 'Cerro Azul',
      'Colombo', 'Contenda', 'Doutor Ulysses', 'Fazenda Rio Grande', 'Itaperuçu', 'Lapa', 'Mandirituba', 'Piên',
      'Pinhais', 'Piraquara', 'Quatro Barras', 'Rio Branco do Sul', 'Rio Negro', 'São José dos Pinhais',
      'Quitandinha', 'Tijucas do Sul', 'Tunas do Paraná',
    ],
  },
  {
    slug: 'porto-alegre',
    name: 'Região Metropolitana de Porto Alegre',
    state: 'RS',
    sourceUrl: 'https://iede.rs.gov.br/portal/home/item.html?id=f9d762cfe7584a1e9f6f999c9149b652',
    municipalities: [
      'Alvorada', 'Araricá', 'Arroio dos Ratos', 'Cachoeirinha', 'Campo Bom', 'Canoas', 'Capela de Santana',
      'Charqueadas', 'Dois Irmãos', 'Eldorado do Sul', 'Estância Velha', 'Esteio', 'Glorinha', 'Gravataí',
      'Guaíba', 'Igrejinha', 'Ivoti', 'Montenegro', 'Nova Hartz', 'Nova Santa Rita', 'Novo Hamburgo', 'Parobé',
      'Portão', 'Porto Alegre', 'Rolante', 'Santo Antônio da Patrulha', 'São Jerônimo', 'São Leopoldo',
      'São Sebastião do Caí', 'Sapiranga', 'Sapucaia do Sul', 'Taquara', 'Triunfo', 'Viamão',
    ],
  },
];

export function metropolitanRegion(slug: string): MetropolitanRegionDefinition | undefined {
  return METROPOLITAN_REGIONS.find((region) => region.slug === slug);
}
