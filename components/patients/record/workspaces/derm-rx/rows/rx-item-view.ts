"use client";

/** Type aliases exposing the union variant per route for row field props. */

import type { RxItem } from "../schema/rx-item";

export type RxItemTopical = Extract<RxItem, { route: "topical" }>;
export type RxItemOral = Extract<RxItem, { route: "oral" }>;
export type RxItemIntralesional = Extract<
  RxItem,
  { route: "intralesional" }
>;
