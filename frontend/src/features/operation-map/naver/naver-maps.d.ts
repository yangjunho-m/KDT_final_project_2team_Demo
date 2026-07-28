// NAVER Maps JavaScript API v3 — 사용하는 표면만 최소 선언 (패키지 미설치 정책)
declare namespace naver.maps {
  class LatLng {
    constructor(lat: number, lng: number);
    lat(): number;
    lng(): number;
  }

  class LatLngBounds {
    constructor(sw: LatLng, ne: LatLng);
    getSW(): LatLng;
    getNE(): LatLng;
  }

  type MapOptions = {
    center?: LatLng;
    zoom?: number;
    mapTypeId?: string;
    mapDataControl?: boolean;
    logoControlOptions?: { position?: number };
    draggable?: boolean;
    scrollWheel?: boolean;
    pinchZoom?: boolean;
    keyboardShortcuts?: boolean;
    disableDoubleClickZoom?: boolean;
  };

  class Map {
    constructor(el: HTMLElement, options?: MapOptions);
    setCenter(latlng: LatLng): void;
    setZoom(zoom: number): void;
    getZoom(): number;
    setMapTypeId(mapTypeId: string): void;
    getBounds(): LatLngBounds;
    /** 주어진 영역이 화면에 딱 맞도록 center/zoom을 함께 계산해 적용한다. */
    fitBounds(bounds: LatLngBounds, margin?: number): void;
    destroy(): void;
  }

  class Point {
    constructor(x: number, y: number);
  }

  type MarkerIcon = {
    content: string;
    anchor?: Point;
  };

  type MarkerOptions = {
    position: LatLng;
    map?: Map | null;
    title?: string;
    zIndex?: number;
    icon?: MarkerIcon;
    clickable?: boolean;
  };

  class Marker {
    constructor(options: MarkerOptions);
    setPosition(latlng: LatLng): void;
    setMap(map: Map | null): void;
    setZIndex(zIndex: number): void;
    setIcon(icon: MarkerIcon): void;
    getPosition(): LatLng;
  }

  type CircleOptions = {
    map?: Map | null;
    center: LatLng;
    radius: number;
    strokeColor?: string;
    strokeOpacity?: number;
    strokeWeight?: number;
    strokeStyle?: string;
    fillColor?: string;
    fillOpacity?: number;
    clickable?: boolean;
  };

  class Circle {
    constructor(options: CircleOptions);
    setMap(map: Map | null): void;
    setCenter(center: LatLng): void;
    setRadius(radius: number): void;
    setOptions(options: Partial<CircleOptions>): void;
  }

  type PolylineOptions = {
    map?: Map | null;
    path: LatLng[];
    strokeColor?: string;
    strokeOpacity?: number;
    strokeWeight?: number;
    strokeStyle?: string;
    clickable?: boolean;
  };

  class Polyline {
    constructor(options: PolylineOptions);
    setMap(map: Map | null): void;
    setPath(path: LatLng[]): void;
    setOptions(options: Partial<PolylineOptions>): void;
  }

  /** 지도 click 등 포인터 이벤트 콜백 인자 */
  type PointerEvent = {
    coord: LatLng;
  };

  type InfoWindowOptions = {
    content?: string;
    borderWidth?: number;
    disableAnchor?: boolean;
  };

  class InfoWindow {
    constructor(options?: InfoWindowOptions);
    setContent(content: string): void;
    open(map: Map, anchor: Marker | LatLng): void;
    close(): void;
    getMap(): Map | null;
  }

  const MapTypeId: {
    NORMAL: string;
    SATELLITE: string;
    HYBRID: string;
    TERRAIN: string;
  };

  namespace Event {
    function addListener(
      target: unknown,
      eventName: string,
      handler: (...args: unknown[]) => void,
    ): unknown;
    function removeListener(listener: unknown): void;
  }
}

interface Window {
  naver?: { maps: typeof naver.maps };
  /** SDK가 인증 실패 시 호출하는 전역 콜백 (네이버 공식 계약) */
  navermap_authFailure?: () => void;
}
