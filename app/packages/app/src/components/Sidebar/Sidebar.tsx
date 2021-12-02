import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import { RecoilState, useRecoilState } from "recoil";
import { animated, Controller } from "@react-spring/web";
import styled from "styled-components";

import { move } from "@fiftyone/utilities";

import { useEventHandler } from "../../utils/hooks";
import { scrollbarStyles } from "../utils";
import { EntryKind, SidebarEntry } from "./utils";

const MARGIN = 4;

const fn = (
  items: InteractiveItems,
  currentOrder: string[],
  newOrder: string[],
  activeKey: string = null,
  delta = 0
) => {
  let groupActive = false;
  const currentY = {};
  let y = 0;
  for (const key of currentOrder) {
    const {
      entry,
      el,
      controller: { springs },
    } = items[key];
    if (entry.kind === EntryKind.GROUP) {
      groupActive = key === activeKey;
    }
    let shown = true;

    if (entry.kind === EntryKind.PATH) {
      shown = entry.shown;
    } else if (entry.kind === EntryKind.EMPTY) {
      shown = entry.shown;
    }

    const height = el.getBoundingClientRect().height;
    const scale = springs.scale.get();
    if (scale > 1) {
      y += (height - height / scale) / 2;
    }

    currentY[key] = y;

    if (shown) {
      y += height + MARGIN;
    }
  }

  const results = {};
  y = 0;
  let paths = 0;

  groupActive = false;
  for (const key of newOrder) {
    const {
      entry,
      el,
      controller: { springs },
    } = items[key];
    if (entry.kind === EntryKind.GROUP) {
      groupActive = key === activeKey;
      paths = 0;
    }

    const dragging =
      (activeKey === key || groupActive) && entry.kind !== EntryKind.TAIL;
    let shown = true;

    if (entry.kind === EntryKind.PATH) {
      shown = entry.shown;
      paths++;
    } else if (entry.kind === EntryKind.EMPTY) {
      shown = paths === 0 && entry.shown;
    }

    results[key] = {
      cursor: dragging ? "grabbing" : "unset",
      top: dragging ? currentY[key] + delta : y,
      zIndex: dragging ? 1 : 0,
      left: shown ? "unset" : -3000,
      scale: dragging ? 1.05 : 1,
      shadow: dragging ? 8 : 0,
    };

    if (shown) {
      y += el.getBoundingClientRect().height / springs.scale.get() + MARGIN;
    }

    if (activeKey) {
      results[key].immediate = (k) =>
        (dragging && k !== "scale") || ["left", "zIndex", "cursor"].includes(k);
    }
  }

  return results;
};

const InteractiveSidebarContainer = styled.div`
  position: relative;
  height: auto;
  overflow: visible;

  & > div {
    position: absolute;
    transform-origin: 50% 50% 0px;
    touch-action: none;
    width: 100%;
  }
`;

const isShown = (entry: SidebarEntry) => {
  if (entry.kind === EntryKind.PATH && !entry.shown) {
    return false;
  }

  if (entry.kind === EntryKind.EMPTY && !entry.shown) {
    return false;
  }

  if (entry.kind === EntryKind.TAIL || entry.kind === EntryKind.EMPTY) {
    return false;
  }

  return true;
};

const measureEntries = (
  items: InteractiveItems,
  order: string[]
): { top: number; height: number; key: string }[] => {
  const data = [];
  let previous = { top: MARGIN, height: 0 };

  for (let i = 0; i < order.length; i++) {
    const key = order[i];
    const entry = items[key].entry;

    if (!isShown(entry)) continue;

    let height = Math.round(
      items[key].el.getBoundingClientRect().height /
        items[key].controller.springs.scale.get()
    );

    const top = previous.top + previous.height + MARGIN;
    data.push({ key, height, top });
    previous = { top, height };
  }

  return data;
};

const measureGroups = (
  items: InteractiveItems,
  order: string[]
): { top: number; height: number; key: string }[] => {
  const data = [];
  let current = { top: MARGIN, height: 0, key: null };

  for (let i = 0; i < order.length; i++) {
    const key = order[i];
    const entry = items[key].entry;

    if (entry.kind === EntryKind.TAIL) break;

    if (entry.kind === EntryKind.GROUP) {
      data.push(current);
      current = { top: current.top + current.height, height: 0, key };
      data[data.length - 1].height -= MARGIN;
    }

    if (!isShown(entry)) continue;

    current.height +=
      items[key].el.getBoundingClientRect().height /
        items[key].controller.springs.scale.get() +
      MARGIN;
  }

  data.push(current);

  return data;
};

const getAfterKey = (
  activeKey: string,
  items: InteractiveItems,
  order: string[],
  direction: Direction
): string | null => {
  if (!items[activeKey]) {
    return;
  }

  const up = direction === Direction.UP;
  const baseTop = items[order[0]].el.parentElement.getBoundingClientRect().y;
  const isGroup = items[activeKey].entry.kind === EntryKind.GROUP;
  const data = isGroup
    ? measureGroups(items, order)
    : measureEntries(items, order);

  const { height: activeHeight } = data.filter(
    ({ key }) => key === activeKey
  )[0];
  const { top } = items[activeKey].el.getBoundingClientRect();
  let y = top - baseTop;

  if (!up) {
    y += activeHeight;
  }

  const filtered = data
    .map(({ key, top, height }) => {
      const midpoint = up ? top + height / 2 : top + height - height / 2;
      return {
        delta: up ? midpoint - y : y - midpoint,
        key,
      };
    })
    .sort((a, b) => a.delta - b.delta)
    .filter(({ delta, key }) => delta >= 0 || key === activeKey);

  if (!filtered.length) {
    return up ? data.slice(-1)[0].key : data[0].key;
  }

  let result = filtered[0].key;
  if (isGroup) {
    if (result === null) return null;

    let index = order.indexOf(result) + (up ? -1 : 1);
    if (result === activeKey) index--;
    if (index <= 0) return null;

    if (order[index] === activeKey) return activeKey;

    while (
      [EntryKind.PATH, EntryKind.GROUP].includes(items[order[index]].entry.kind)
    )
      index++;

    return order[index];
  }

  if (order.indexOf(result) === 0) {
    return order[1];
  }

  return result;
};

const getEntryKey = (entry: SidebarEntry) => {
  if (entry.kind === EntryKind.GROUP) {
    return JSON.stringify([entry.name]);
  }

  if (entry.kind === EntryKind.PATH) {
    return JSON.stringify(["", entry.path]);
  }

  if (entry.kind === EntryKind.EMPTY) {
    return JSON.stringify([entry.group, ""]);
  }

  return "tail";
};

type InteractiveItems = {
  [key: string]: {
    el: HTMLDivElement;
    controller: Controller;
    entry: SidebarEntry;
    active: boolean;
  };
};

enum Direction {
  UP = "UP",
  DOWN = "DOWN",
}

const SidebarColumn = styled.div`
  max-height: 100%;
  height: 100%;
  overflow-y: scroll;
  overflow-x: hidden;
  scrollbar-color: ${({ theme }) => theme.fontDarkest}
    ${({ theme }) => theme.background};

  ${scrollbarStyles}

  & > * {
    margin-left: 1rem;
    margin-right: 0.5rem;
  }
`;

const InteractiveSidebar = ({
  before,
  entriesAtom,
  render,
}: {
  before?: React.ReactNode;
  entriesAtom: RecoilState<SidebarEntry[]>;
  render: (
    group: string,
    entry: SidebarEntry,
    controller: Controller
  ) => { children: React.ReactNode; disabled: boolean };
}) => {
  const [entries, setEntries] = useRecoilState(entriesAtom);
  const order = useRef<string[]>([]);
  const lastOrder = useRef<string[]>([]);
  const down = useRef<string>(null);
  const last = useRef<number>(null);
  const lastDirection = useRef<Direction>(null);
  const start = useRef<number>(0);
  const items = useRef<InteractiveItems>({});
  const container = useRef<HTMLDivElement>();

  let group = null;
  order.current = entries.map((entry) => getEntryKey(entry));
  for (const entry of entries) {
    if (entry.kind === EntryKind.GROUP) {
      group = entry.name;
    }

    const key = getEntryKey(entry);

    if (!(key in items.current)) {
      items.current[key] = {
        el: null,
        controller: new Controller({
          cursor: "pointer",
          top: 0,
          zIndex: 0,
          left: "unset",
          scale: 1,
          shadow: 0,
        }),
        entry,
        active: false,
      };
    } else {
      items.current[key].entry = entry;
    }
  }

  const getNewOrder = (direction: Direction): string[] => {
    let after = getAfterKey(
      down.current,
      items.current,
      lastOrder.current,
      direction
    );

    let entry = items.current[down.current].entry;
    if (down.current === after && entry.kind === EntryKind.GROUP) {
      const ai = lastOrder.current.indexOf(after) - 1;
      after = ai >= 0 ? lastOrder.current[ai] : null;
    }

    let from = lastOrder.current.indexOf(down.current);
    let to = after ? lastOrder.current.indexOf(after) : 0;

    if (entry.kind === EntryKind.PATH) {
      to = Math.max(to, 1);
      return move(lastOrder.current, from, to);
    }

    const section = [];
    do {
      section.push(lastOrder.current[from]);
      from++;
      entry = items.current[lastOrder.current[from]].entry;
    } while (entry.kind !== EntryKind.GROUP && entry.kind !== EntryKind.TAIL);

    if (after === null) {
      return [
        ...section,
        ...lastOrder.current.filter((key) => !section.includes(key)),
      ];
    }
    const result = [];
    const pool = lastOrder.current.filter((key) => !section.includes(key));
    let i = 0;
    let terminate = false;
    while (i < pool.length && !terminate) {
      result.push(pool[i]);
      terminate = pool[i] === after;
      i++;
    }

    return [...result, ...section, ...pool.slice(i)];
  };

  const placeItems = useCallback(() => {
    const placements = fn(items.current, order.current, order.current);
    for (const key of order.current) {
      const item = items.current[key];
      if (item.active) {
        item.controller.start(placements[key]);
      } else {
        item.controller.set(placements[key]);
        item.active = true;
      }
    }
  }, []);

  useEventHandler(document.body, "mouseup", (event) => {
    if (start.current === event.clientY || down.current == null) {
      down.current = null;
      start.current = null;
      return;
    }

    requestAnimationFrame(() => {
      const newOrder = getNewOrder(lastDirection.current);
      order.current = newOrder;
      setEntries(order.current.map((key) => items.current[key].entry));
      down.current = null;
      start.current = null;
      lastDirection.current = null;
    });
  });

  const scrollWith = useCallback((direction: Direction, event: MouseEvent) => {
    const { top } = container.current.getBoundingClientRect();
    const scroll = container.current.scrollTop;
    if (direction === Direction.UP) {
      if (scroll === 0) return 0;
      const delta = event.clientY - top;

      if (delta < 0) {
        // container.current.scrollBy({ top: delta, behavior: "smooth" });
        return delta;
      }
    }

    return 0;
  }, []);

  useEventHandler(document.body, "mousemove", (event) => {
    if (down.current == null) return;

    const delta = event.clientY - last.current;
    if (Math.abs(delta) <= 1) return;

    const entry = items.current[down.current].entry;
    lastDirection.current =
      event.clientY - last.current > 0 ? Direction.DOWN : Direction.UP;

    if (![EntryKind.PATH, EntryKind.GROUP].includes(entry.kind)) return;
    requestAnimationFrame(() => {
      start.current -= scrollWith(lastDirection.current, event);
      const realDelta = event.clientY - start.current;
      const newOrder = getNewOrder(lastDirection.current);
      const results = fn(
        items.current,
        order.current,
        newOrder,
        down.current,
        realDelta
      );
      for (const key of order.current)
        items.current[key].controller.start(results[key]);

      last.current = event.clientY;
      lastOrder.current = newOrder;
    });
  });

  const trigger = useCallback((event) => {
    if (event.button !== 0) return;

    down.current = event.currentTarget.dataset.key;
    start.current = event.clientY;
    last.current = start.current;
    lastOrder.current = order.current;
  }, []);

  const [observer] = useState<ResizeObserver>(
    () => new ResizeObserver(placeItems)
  );

  useLayoutEffect(placeItems, [entries]);

  return (
    <SidebarColumn ref={container}>
      {before}
      <InteractiveSidebarContainer key={"interactive-fields"}>
        {order.current.map((key) => {
          const entry = items.current[key].entry;
          if (entry.kind === EntryKind.GROUP) {
            group = entry.name;
          }

          const { shadow, ...springs } = items.current[key].controller.springs;
          const { children, disabled } = render(
            group,
            entry,
            items.current[key].controller
          );

          return (
            <animated.div
              data-key={key}
              onMouseDown={disabled ? null : trigger}
              ref={(node) => {
                items.current[key].el &&
                  observer.unobserve(items.current[key].el);
                node && observer.observe(node);
                items.current[key].el = node;
              }}
              key={key}
              style={{
                ...springs,
                boxShadow: shadow.to(
                  (s) => `rgba(0, 0, 0, 0.15) 0px ${s}px ${2 * s}px 0px`
                ),
              }}
            >
              {children}
            </animated.div>
          );
        })}
      </InteractiveSidebarContainer>
    </SidebarColumn>
  );
};

export default InteractiveSidebar;
