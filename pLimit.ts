export const pLimit = (max: number) => {
  const queue: (() => void)[] = [];
  let active = 0;
  const next = () => {
    active--;
    if (queue.length) queue.shift()!();
  };
  return <T>(fn: () => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      const run = () => {
        active++;
        fn().then((v) => { resolve(v); next(); })
          .catch((e) => { reject(e); next(); });
      };
      if (active < max) run();
      else queue.push(run);
    });
};
