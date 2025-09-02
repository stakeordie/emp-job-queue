import RedisServerClient from "../../../clients/redis-server-client";
import { NodeOutputData } from ".";
import {
  Config,
  ToImgResponse,
  Txt2ImgSettings,
} from "../../../clients/stable-diffusion-client";

export default async function execute(
  _: Config,
  input: Txt2ImgSettings,
): Promise<NodeOutputData<ToImgResponse>> {
  const redisServerClient = RedisServerClient.getInstance(
    process.env.REDIS_SERVER_URL,
    process.env.REDIS_SERVER_TOKEN,
  );
  const response = await redisServerClient.runAuto1111Prompt(input, "txt2img");
  const time = 0;
  const server = null;
  const output = !response.output ? response : response.output;
  return {
    _meta: {
      time,
      server,
    },
    parameters: input,
    data: output,
  };
}
