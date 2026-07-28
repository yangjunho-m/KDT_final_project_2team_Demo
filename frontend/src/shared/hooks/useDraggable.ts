import { useCallback, useEffect, useRef, useState } from "react";

export type DraggableOffset = { x: number; y: number };

const INTERACTIVE_SELECTOR = "button, input, select, textarea, a, [role='button']";

/**
 * 팝업/패널을 포인터 드래그로 옮기는 훅.
 * 반환한 `onDragHandlePointerDown`을 헤더 등 "손잡이" 요소에 연결하면,
 * 그 요소를 눌러 끄는 동안 `style`에 누적된 translate 오프셋이 반영된다.
 * 컴포넌트가 리마운트되면(팝업을 닫았다 다시 열면) 오프셋은 자동으로 초기화된다.
 *
 * `initialOffset`을 주면 그 위치에서 시작한다 — 여러 팝업을 동시에 띄울 때
 * 서로 겹치지 않도록 계단식(cascade)으로 살짝 어긋나게 배치하는 데 쓴다.
 */
export function useDraggable(initialOffset: DraggableOffset = { x: 0, y: 0 }) {
  const [offset, setOffset] = useState<DraggableOffset>(initialOffset);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handlePointerMove = useCallback((event: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    setOffset({
      x: drag.originX + (event.clientX - drag.startX),
      y: drag.originY + (event.clientY - drag.startY),
    });
  }, []);

  // pointerup은 드래그당 한 번만 필요하므로 { once: true }로 등록해 브라우저가
  // 자동으로 정리하게 한다 — stopDragging이 자기 자신을 remove할 필요가 없어진다.
  const stopDragging = useCallback(() => {
    dragRef.current = null;
    setIsDragging(false);
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", handlePointerMove);
  }, [handlePointerMove]);

  const onDragHandlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0) {
        return;
      }
      const target = event.target as HTMLElement;
      // 버튼/입력 등 상호작용 요소 클릭은 드래그로 취급하지 않는다.
      if (target.closest(INTERACTIVE_SELECTOR)) {
        return;
      }
      dragRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        originX: offset.x,
        originY: offset.y,
      };
      setIsDragging(true);
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", stopDragging, { once: true });
    },
    [offset, handlePointerMove, stopDragging],
  );

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDragging);
      document.body.style.userSelect = "";
    };
  }, [handlePointerMove, stopDragging]);

  const style =
    offset.x !== 0 || offset.y !== 0
      ? { transform: `translate(${offset.x}px, ${offset.y}px)` }
      : undefined;

  return { style, onDragHandlePointerDown, isDragging };
}
