# Noree · React Lab

A workbench for experiments with React-adjacent tech. Each experiment
integrates one thing properly — and where it's feasible, we build our own
version to compare.

## Run

```sh
npm install
npm run dev
```

Then open http://localhost:5173 in a browser.

## Experiments

| #   | Name              | Route        | State |
| --- | ----------------- | ------------ | ----- |
| 01  | BlockNote editor  | `#/blocknote` | live  |

Queued: mini block editor from scratch, virtualized 100k rows, Suspense data
fetching. See `src/experiments/registry.ts`.

## Add an experiment

1. Create `src/experiments/<name>/`
2. Register it in `src/experiments/registry.ts`
3. Add its route in `src/App.tsx`

## Checks

```sh
npm run lint   # oxlint
npm run build  # tsc + vite build
```
