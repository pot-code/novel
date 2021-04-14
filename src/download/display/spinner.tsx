import EventEmitter from 'events';

import { Box, Text } from 'ink';
import React, { useEffect, useReducer, useState } from 'react';

import { SPINNER_GRAPH, SPINNER_INTERVAL } from '../../constants';
import { DownloadInit, DownloadProgress } from '../types';

type SpinnerState = {
  total: number;
  title: string;
  index: number;
};

type Action =
  | { type: 'progress'; payload: DownloadProgress }
  | { type: 'init'; payload: { total: number } };

function reducer(state: SpinnerState, action: Action): SpinnerState {
  switch (action.type) {
    case 'progress':
      const { index, title } = action.payload;
      return { ...state, index, title };
    case 'init':
      const { total } = action.payload;
      return { ...state, total };
    default:
      return state;
  }
}

const Anime = () => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((pv) => (pv + 1) % SPINNER_GRAPH.length);
    }, SPINNER_INTERVAL);
    return () => {
      clearInterval(timer);
    };
  }, []);
  return <Text color="yellow">{SPINNER_GRAPH[index]} </Text>;
};

const Title = ({ subject }: { subject: EventEmitter }) => {
  const [state, dispatch] = useReducer(reducer, {
    total: -1,
    title: '',
    index: -1,
  });

  function listener(p: DownloadProgress) {
    dispatch({
      type: 'progress',
      payload: p,
    });
  }

  function init(p: DownloadInit) {
    dispatch({
      type: 'init',
      payload: p,
    });
  }

  useEffect(() => {
    subject.on('init', init);
    subject.on('progress', listener);

    return () => {
      subject.removeListener('progress', listener);
      subject.removeListener('init', init);
    };
  }, [subject]);

  return (
    <>
      <Text color="greenBright">
        [{state.index + 1}/{state.total}]
      </Text>
      <Text color="gray"> {state.title}</Text>
    </>
  );
};

export const Spinner = ({ subject }: { subject: EventEmitter }) => {
  return (
    <Box flexDirection="column">
      <Text>
        <Anime />
        <Title subject={subject} />
      </Text>
    </Box>
  );
};
