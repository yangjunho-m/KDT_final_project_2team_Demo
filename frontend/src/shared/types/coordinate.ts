export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type ThreeDimensionalCoordinate = Coordinate & {
  altitude: number;
};
