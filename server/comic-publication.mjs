import {createHash} from 'node:crypto';

const ENGLISH = /^[\x09\x0a\x0d\x20-\x7e]*$/;
const fail=message=>{const error=new Error(message);error.statusCode=400;throw error;};
export function validatePublication(work,input){
 if(!work)fail('Unknown capture batch');
 if(!input||typeof input!=='object')fail('Publication payload is required');
 const {metadata,imageBase64}=input;
 if(!metadata||metadata.language!=='en'||metadata.reviewed!==true||metadata.storyIsFiction!==true||metadata.continuousEventVerified!==false)fail('English, reviewed, fictional-story metadata is required');
 if(JSON.stringify(metadata.photoIds)!==JSON.stringify(work.photoIds))fail('Source photos must exactly match this batch, in order');
 if(!Array.isArray(metadata.panels)||metadata.panels.length<1||metadata.panels.length>6)fail('One to six panels are required');
 const text=(value,label,max)=>{if(typeof value!=='string'||!value.trim()||value.length>max||!ENGLISH.test(value))fail(`${label} must be nonempty English text`);return value.trim();};
 const title=text(metadata.title,'Title',120),summary=text(metadata.summary,'Summary',2000);
 const panels=metadata.panels.map((panel,i)=>{if(!work.photoIds.includes(panel.photoId)||(metadata.panels.length===work.photoIds.length&&panel.photoId!==work.photoIds[i]))fail('Panel source photo does not match its position');return {photoId:panel.photoId,caption:text(panel.caption,'Caption',120),dialogue:text(panel.dialogue,'Dialogue',180),observation:text(panel.observation,'Observation',1000),uncertainty:text(panel.uncertainty,'Uncertainty',1000)};});
 const prompt=text(metadata.prompt,'Generation prompt',20000);
 if(typeof imageBase64!=='string'||imageBase64.length>32*1024*1024||!/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64))fail('PNG image data is required (maximum 24 MB)');
 const buffer=Buffer.from(imageBase64,'base64');
 if(buffer.length<45||!buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||buffer.toString('ascii',12,16)!=='IHDR'||buffer.toString('ascii',buffer.length-8,buffer.length-4)!=='IEND')fail('A complete PNG is required');
 const width=buffer.readUInt32BE(16),height=buffer.readUInt32BE(20);
 if(width<16||height<16||width*height>40000000)fail('PNG dimensions are unsupported');
 const digest=createHash('sha256').update(buffer).digest('hex');
 return {buffer,digest,width,height,metadata:{title,summary,language:'en',photoIds:[...work.photoIds],panels,prompt,reviewed:true,storyIsFiction:true,continuousEventVerified:false,generationMode:'assistant-imagegen',styleVersion:'warm-storybook-en-v1'}};
}
