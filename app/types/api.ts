/** A set in card_sets (for rarity and date) */
export interface CardSetEntry {
  set_name?: string
  set_rarity?: string
  set_release_date?: string
  set_price?: string
}

/** An image in card_images */
export interface CardImage {
  id: number
  image_url: string
  image_url_small?: string
  image_url_cropped?: string
}

/** Card returned by cardinfo.php */
export interface YgoCard {
  id: number
  name: string
  /** English name — present when language != 'en' */
  name_en?: string
  type: string
  frameType?: string
  desc?: string
  atk?: number
  def?: number
  level?: number
  race?: string
  attribute?: string
  archetype?: string
  card_sets?: CardSetEntry[]
  card_images?: CardImage[]
}

export interface CardInfoApiResponse {
  data: YgoCard[]
}
