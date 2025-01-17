import { useTheme } from "@fiftyone/components";
import { AbstractLooker, ImaVidLooker } from "@fiftyone/looker";
import { BaseState } from "@fiftyone/looker/src/state";
import * as fos from "@fiftyone/state";
import { useEventHandler, useOnSelectLabel } from "@fiftyone/state";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useErrorHandler } from "react-error-boundary";
import { useRecoilCallback, useRecoilValue, useSetRecoilState } from "recoil";
import { v4 as uuid } from "uuid";
import { useInitializeImaVidSubscriptions, useModalContext } from "./hooks";

const useLookerOptionsUpdate = () => {
  return useRecoilCallback(
    ({ snapshot, set }) =>
      async (update: object, updater?: (updated: {}) => void) => {
        const currentOptions = await snapshot.getPromise(
          fos.savedLookerOptions
        );

        const panels = await snapshot.getPromise(fos.lookerPanels);
        const updated = {
          ...currentOptions,
          ...update,
          showJSON: panels.json.isOpen,
          showHelp: panels.help.isOpen,
        };
        set(fos.savedLookerOptions, updated);
        if (updater) updater(updated);
      }
  );
};

const useShowOverlays = () => {
  return useRecoilCallback(({ set }) => async (event: CustomEvent) => {
    set(fos.showOverlays, event.detail);
  });
};

const useClearSelectedLabels = () => {
  return useRecoilCallback(
    ({ set }) =>
      async () =>
        set(fos.selectedLabels, []),
    []
  );
};

interface LookerProps {
  sample?: fos.ModalSample;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
}

export const ModalLooker = React.memo(
  ({ sample: propsSampleData }: LookerProps) => {
    const [id] = useState(() => uuid());

    const modalSampleData = useRecoilValue(fos.modalSample);
    const colorScheme = useRecoilValue(fos.colorScheme);

    const sampleData = useMemo(() => {
      if (propsSampleData) {
        return {
          ...modalSampleData,
          ...propsSampleData,
        };
      }

      return modalSampleData;
    }, [propsSampleData, modalSampleData]);

    const { sample } = sampleData;

    const theme = useTheme();
    const initialRef = useRef<boolean>(true);
    const lookerOptions = fos.useLookerOptions(true);
    const [reset, setReset] = useState(false);
    const selectedMediaField = useRecoilValue(fos.selectedMediaField(true));
    const shouldRenderImaVidLooker = useRecoilValue(
      fos.shouldRenderImaVidLooker(true)
    );
    const setModalLooker = useSetRecoilState(fos.modalLooker);
    const { subscribeToImaVidStateChanges } =
      useInitializeImaVidSubscriptions();

    const createLooker = fos.useCreateLooker(true, false, {
      ...lookerOptions,
    });

    const { setActiveLookerRef } = useModalContext();

    const looker = React.useMemo(
      () => createLooker.current(sampleData),
      [reset, createLooker, selectedMediaField, shouldRenderImaVidLooker]
    ) as AbstractLooker<BaseState>;

    useEffect(() => {
      setModalLooker(looker);
      if (looker instanceof ImaVidLooker) {
        subscribeToImaVidStateChanges();
      }
    }, [looker, subscribeToImaVidStateChanges]);

    useEffect(() => {
      if (looker) {
        setActiveLookerRef(looker as fos.Lookers);
      }
    }, [looker]);

    useEffect(() => {
      !initialRef.current && looker.updateOptions(lookerOptions);
    }, [lookerOptions]);

    useEffect(() => {
      !initialRef.current && looker.updateSample(sample);
    }, [sample, colorScheme]);

    useEffect(() => {
      return () => looker?.destroy();
    }, [looker]);

    const handleError = useErrorHandler();

    const updateLookerOptions = useLookerOptionsUpdate();
    useEventHandler(looker, "options", (e) => updateLookerOptions(e.detail));
    useEventHandler(looker, "showOverlays", useShowOverlays());
    useEventHandler(looker, "reset", () => {
      setReset((c) => !c);
    });

    const jsonPanel = fos.useJSONPanel();
    const helpPanel = fos.useHelpPanel();

    useEventHandler(looker, "select", useOnSelectLabel());
    useEventHandler(looker, "error", (event) => handleError(event.detail));
    useEventHandler(
      looker,
      "panels",
      async ({ detail: { showJSON, showHelp, SHORTCUTS } }) => {
        if (showJSON) {
          if (shouldRenderImaVidLooker) {
            const imaVidFrameSample = (looker as ImaVidLooker).thisFrameSample;
            jsonPanel[showJSON](imaVidFrameSample);
          } else {
            jsonPanel[showJSON](sample);
          }
        }
        if (showHelp) {
          if (showHelp == "close") {
            helpPanel.close();
          } else {
            helpPanel[showHelp](shortcutToHelpItems(SHORTCUTS));
          }
        }

        updateLookerOptions({}, (updatedOptions) =>
          looker.updateOptions(updatedOptions)
        );
      }
    );

    useEffect(() => {
      initialRef.current = false;
    }, []);

    useEffect(() => {
      looker.attach(id);
    }, [looker, id]);

    useEventHandler(looker, "clear", useClearSelectedLabels());

    const hoveredSample = useRecoilValue(fos.hoveredSample);

    useEffect(() => {
      const hoveredSampleId = hoveredSample?._id;
      looker.updater((state) => ({
        ...state,
        // todo: `|| shouldRenderImaVidLooker` is a hack until hoveredSample works for imavid looker
        shouldHandleKeyEvents:
          hoveredSampleId === sample._id || shouldRenderImaVidLooker,
        options: {
          ...state.options,
        },
      }));
    }, [hoveredSample, sample, looker, shouldRenderImaVidLooker]);

    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
      ref.current?.dispatchEvent(
        new CustomEvent(`looker-attached`, { bubbles: true })
      );
    }, [ref]);

    return (
      <div
        ref={ref}
        id={id}
        data-cy="modal-looker-container"
        style={{
          width: "100%",
          height: "100%",
          background: theme.background.level2,
          position: "relative",
        }}
      />
    );
  }
);

function shortcutToHelpItems(SHORTCUTS) {
  return Object.values(
    Object.values(SHORTCUTS).reduce((acc, v) => {
      acc[v.shortcut] = v;

      return acc;
    }, {})
  );
}
