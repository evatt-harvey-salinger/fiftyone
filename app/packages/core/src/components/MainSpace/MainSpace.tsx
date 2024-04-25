import { SpacesRoot, usePanelsState, useSpaces } from "@fiftyone/spaces";
import { constants, useSessionSpaces } from "@fiftyone/state";
import { isEqual, size } from "lodash";
import React, { useEffect, useRef } from "react";

const { FIFTYONE_SPACE_ID } = constants;

function MainSpace() {
  const [sessionSpaces, setSessionSpaces, sessionPanelsState] =
    useSessionSpaces();
  const { spaces, updateSpaces } = useSpaces(FIFTYONE_SPACE_ID, sessionSpaces);
  const [panelsState, setPanelsState] = usePanelsState();
  const oldSpaces = useRef(spaces);
  const oldPanelsState = useRef(panelsState);
  const isMounted = useRef(false);

  useEffect(() => {
    if (!spaces.equals(sessionSpaces)) {
      updateSpaces(sessionSpaces);
    }
  }, [sessionSpaces]);

  useEffect(() => {
    if (size(sessionPanelsState)) {
      setPanelsState(sessionPanelsState);
    }
  }, [sessionPanelsState]);

  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
      return;
    }
    const serializedSpaces = spaces.toJSON();
    const spacesUpdated =
      !spaces.equals(sessionSpaces) && !spaces.equals(oldSpaces.current);
    const panelsStateUpdated =
      !isEqual(sessionPanelsState, panelsState) &&
      !isEqual(panelsState, oldPanelsState.current);
    console.log({ panelsState, old: oldPanelsState.current });
    if (spacesUpdated || panelsStateUpdated) {
      setSessionSpaces(serializedSpaces, panelsState);
    }
    oldSpaces.current = serializedSpaces;
    oldPanelsState.current = panelsState;
  }, [
    oldSpaces,
    panelsState,
    sessionSpaces,
    sessionPanelsState,
    setSessionSpaces,
    spaces,
  ]);

  return <SpacesRoot id={FIFTYONE_SPACE_ID} />;
}

export default React.memo(MainSpace);
