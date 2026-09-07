export type PriceTier = {
  /** минимальное количество для этой цены */
  from: number;
  /** максимальное количество (не задано = «и больше») */
  to?: number;
  /** цена за штуку в юанях */
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
  /** цена за штуку в юанях (минимальная из диапазона) */
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
  /** источник данных: реальный парсер или встроенная демо-подборка */
  source: "api" | "demo";
};

export type ParseResult = {
  products: Product[];
  /** сообщения о том, что пошло не так по отдельным ссылкам */
  errors: { input: string; message: string }[];
  source: "api" | "demo";
  /** какой поисковый эндпоинт сработал (для отладки) */
  endpoint?: string;
};
