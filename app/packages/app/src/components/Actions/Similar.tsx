import React, { useLayoutEffect } from "react";
import {
  atom,
  selector,
  selectorFamily,
  Snapshot,
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
} from "recoil";

import * as atoms from "../../recoil/atoms";
import * as schemaAtoms from "../../recoil/schema";
import * as selectors from "../../recoil/selectors";
import { State } from "../../recoil/types";
import * as viewAtoms from "../../recoil/view";
import { SORT_BY_SIMILARITY } from "../../utils/links";
import { useTheme } from "../../utils/hooks";

import Checkbox from "../Common/Checkbox";
import Input from "../Common/Input";
import RadioGroup from "../Common/RadioGroup";
import { Button } from "../utils";
import { PopoutSectionTitle } from "../utils";

import { ActionOption } from "./Common";
import Popout from "./Popout";
import { store } from "../Flashlight.store";
import { filters } from "../../recoil/filters";
import { toSnakeCase } from "@fiftyone/utilities";

export const similaritySorting = atom<boolean>({
  key: "similaritySorting",
  default: false,
});

const getQueryIds = async (snapshot: Snapshot, brainKey?: string) => {
  const selectedLabelIds = await snapshot.getPromise(
    selectors.selectedLabelIds
  );
  const selectedLabels = await snapshot.getPromise(selectors.selectedLabels);
  const keys = await snapshot.getPromise(selectors.similarityKeys);
  const labels_field = keys.patches
    .filter(([k, v]) => k === brainKey)
    .map(([k, v]) => v)[0];
  if (selectedLabelIds.size) {
    return [...selectedLabelIds].filter(
      (id) => selectedLabels[id].field === labels_field
    );
  }
  const selectedSamples = await snapshot.getPromise(atoms.selectedSamples);
  const isPatches = await snapshot.getPromise(viewAtoms.isPatchesView);
  const modal = await snapshot.getPromise(atoms.modal);

  if (isPatches) {
    if (selectedSamples.size) {
      return [...selectedSamples].map(
        (id) => store.samples.get(id).sample[labels_field]._id
      );
    }

    return modal.sample[labels_field]._id;
  }

  if (selectedSamples.size) {
    return [...selectedSamples];
  }

  return modal.sample._id;
};

const useSortBySimilarity = () => {
  return useRecoilCallback(
    ({ snapshot, set }) => async () => {
      const params = await snapshot.getPromise(sortBySimilarityParameters);
      const queryIds = await getQueryIds(snapshot, params.brainKey);
      const current = await snapshot.getPromise(filters);
      set(similaritySorting, true);
      set(atoms.modal, null);

      set(filters, {
        ...current,
        _similarity: toSnakeCase({
          queryIds,
          ...params,
        }),
      });
    },
    []
  );
};

const kValue = atom<number>({
  key: "kValue",
  default: null,
});

const reverseValue = atom<boolean>({
  key: "reverseValue",
  default: false,
});

const brainKeyValue = atom<string>({
  key: "brainKeyValue",
  default: null,
});

const searchBrainKeyValue = atom<string>({
  key: "searchBrainKeyValue",
  default: "",
});

const distFieldValue = atom<string>({
  key: "distFieldValue",
  default: null,
});

const availableSimilarityKeys = selectorFamily<string[], boolean>({
  key: "availableSimilarityKeys",
  get: (modal) => ({ get }) => {
    const isPatches = get(viewAtoms.isPatchesView);
    const keys = get(selectors.similarityKeys);
    if (!isPatches && !modal) {
      return keys.samples;
    } else if (!modal) {
      return keys.patches.reduce((acc, [key, field]) => {
        if (get(schemaAtoms.labelPaths({})).includes(field)) {
          acc = [...acc, key];
        }
        return acc;
      }, []);
    } else if (modal) {
      const selectedLabels = get(selectors.selectedLabels);

      if (Object.keys(selectedLabels).length) {
        const fields = new Set(
          Object.values(selectedLabels).map(({ field }) => field)
        );

        const patches = keys.patches
          .filter(([k, v]) => fields.has(v))
          .reduce((acc, [k]) => {
            return [...acc, k];
          }, []);
        return patches;
      } else if (isPatches) {
        const { sample } = get(atoms.modal);

        return keys.patches
          .filter(([k, v]) => sample[v])
          .reduce((acc, [k]) => {
            return [...acc, k];
          }, []);
      }

      return keys.samples;
    }
    return [];
  },
});

const currentSimilarityKeys = selectorFamily<
  { total: number; choices: string[] },
  boolean
>({
  key: "currentSimilarityKeys",
  get: (modal) => ({ get }) => {
    const searchBrainKey = get(searchBrainKeyValue);
    const keys = get(availableSimilarityKeys(modal));
    const result = keys.filter((k) => k.includes(searchBrainKey)).sort();
    return {
      total: keys.length,
      choices: result.slice(0, 11),
    };
  },
});

const sortBySimilarityParameters = selector<State.SortBySimilarityParameters>({
  key: "sortBySimilarityParameters",
  get: ({ get }) => {
    return {
      k: get(kValue),
      brainKey: get(brainKeyValue),
      reverse: get(reverseValue),
      distField: get(distFieldValue),
    };
  },
});

const sortType = selectorFamily<string, boolean>({
  key: "sortBySimilarityType",
  get: (modal) => ({ get }) => {
    const isRoot = get(viewAtoms.isRootView);
    if (modal) {
      return "labels";
    } else if (isRoot) {
      return "images";
    } else {
      return "patches";
    }
  },
});

interface SortBySimilarityProps {
  modal: boolean;
  close: () => void;
  bounds?: any;
}

const SortBySimilarity = React.memo(
  ({ modal, bounds, close }: SortBySimilarityProps) => {
    const [brainKey, setBrainKey] = useRecoilState(brainKeyValue);
    const hasSimilarityKeys =
      useRecoilValue(availableSimilarityKeys(modal)).length > 0;

    const choices = useRecoilValue(currentSimilarityKeys(modal));
    const sortBySimilarity = useSortBySimilarity();
    const [reverse, setReverse] = useRecoilState(reverseValue);
    const [k, setK] = useRecoilState(kValue);
    const [dist, setDist] = useRecoilState(distFieldValue);
    const type = useRecoilValue(sortType(modal));
    const theme = useTheme();

    useLayoutEffect(() => {
      choices.choices.length === 1 && setBrainKey(choices.choices[0]);
    }, [choices]);

    return (
      <Popout modal={modal} bounds={bounds}>
        <PopoutSectionTitle>
          <ActionOption
            href={SORT_BY_SIMILARITY}
            text={"Sort by similarity"}
            title={"About sorting by similarity"}
            style={{
              background: "unset",
              color: theme.font,
              paddingTop: 0,
              paddingBottom: 0,
            }}
            svgStyles={{ height: "1rem", marginTop: 7.5 }}
          />
        </PopoutSectionTitle>
        {hasSimilarityKeys && (
          <>
            <Input
              placeholder={"k (default = None)"}
              validator={(value) => value === "" || /^[0-9\b]+$/.test(value)}
              value={k === null ? "" : String(k)}
              setter={(value) => {
                setK(value === "" ? null : Number(value));
              }}
            />
            <Input
              placeholder={"dist_field (default = None)"}
              validator={(value) => !value.startsWith("_")}
              value={dist === null ? "" : String(k)}
              setter={(value) => {
                setDist(value === "" ? null : value);
              }}
            />
            <Checkbox name={"reverse"} value={reverse} setValue={setReverse} />
            <PopoutSectionTitle style={{ fontSize: 14 }}>
              Brain key
            </PopoutSectionTitle>
            <RadioGroup
              choices={choices.choices}
              value={brainKey}
              setValue={setBrainKey}
            />
            {brainKey && (
              <>
                <PopoutSectionTitle></PopoutSectionTitle>
                <Button
                  text={"Apply"}
                  title={`Sort by similarity to the selected ${type}`}
                  onClick={() => {
                    close();
                    sortBySimilarity();
                  }}
                  style={{
                    margin: "0.25rem -0.5rem",
                    height: "2rem",
                    borderRadius: 0,
                    textAlign: "center",
                  }}
                ></Button>
              </>
            )}
          </>
        )}
      </Popout>
    );
  }
);

export default SortBySimilarity;
