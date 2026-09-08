export type PriceTier = {
  /** минимальное количество для этой цены */
  from: number;
  /** максимальное количество (не задано = «и больше») */
  to?: number;
  /** цена за штуку в валюте товара */
  price: number;
};

export type Review = {
  id: string;
  author?: string;
  rating?: number;
  text: string;
  date?: string;
  images: string[];
  sku?: string;
};

export type Attribute = { name: string; value: string };

export type Sku = {
  id: string;
  name: string;
  image?: string;
  price?: number;
  stock?: number;
};

export type Seller = {
  name?: string;
  url?: string;
  location?: string;
  years?: number;
  rating?: number;
};

export type Product = {
  id: string;
  url: string;
  title: string;
  images: string[];
  /** цена за штуку в валюте товара (минимальная из диапазона) */
  price?: number;
  priceMax?: number;
  tiers: PriceTier[];
  minOrder?: number;
  description?: string;
  attributes: Attribute[];
  skus: Sku[];
  seller?: Seller;
  rating?: number;
  reviewsCount?: number;
  soldCount?: number;
  reviews: Review[];
  /** ISO-код валюты цены: CNY у 1688, USD у открытого каталога */
  currency: string;
  /** id провайдера, откуда пришла карточка */
  source: string;
};

export type ParseResult = {
  products: Product[];
  /** сообщения о том, что пошло не так по отдельным ссылкам */
  errors: { input: string; message: string }[];
  source: string;
  /** какой поисковый эндпоинт сработал (для отладки) */
  endpoint?: string;
};

/**
 * Страница бесконечной ленты. Курсор непрозрачен для клиента и никогда не
 * бывает null: конечный каталог провайдер закольцовывает с новой перетасовкой,
 * поэтому карточки в ленте не заканчиваются.
 */
export type FeedPage = {
  products: Product[];
  cursor: string;
  provider: string;
  providerLabel: string;
  /** каталог пошёл на второй круг — показываем это честно */
  looped: boolean;
};
