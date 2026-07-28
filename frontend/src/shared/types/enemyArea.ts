export type EnemyArea = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  createdAt: string;
  updatedAt: string;
};

export type EnemyAreaCreateInput = {
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
};

export type EnemyAreaUpdateInput = Partial<EnemyAreaCreateInput> & {
  id: string;
};
