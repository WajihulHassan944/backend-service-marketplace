// emailTemplate.js
const generateEmailTemplate = ({
  firstName = '',
  subject = 'doTask Service Marketplace',
  content = '',
  logoUrl = 'https://res.cloudinary.com/dqi6vk2vn/image/upload/v1748849463/qzkvr0x1uwstambemqld.png',
  siteUrl = 'https://dotask-service-marketplace.vercel.app/'
}) => {
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #eee;padding:30px;border-radius:10px;">
      <div style="text-align:center;">
        <img src="${logoUrl}" alt="Logo" style="width:100px;height:100px;border-radius:50%;margin-bottom:10px;" />
        <h1 style="margin:0;color:#333;">${subject}</h1>
      </div>

      <div style="margin-top:30px;color:#333;font-size:16px;line-height:1.6;">
        ${content}
      </div>

      <div style="margin:40px 0;text-align:center;">
        <a href="${siteUrl}" style="display:inline-block;background-color:#007bff;color:#fff;text-decoration:none;padding:12px 25px;border-radius:5px;font-size:16px;">
          Visit doTask
        </a>
      </div>

      <hr style="margin:40px 0;" />

      <div style="text-align:center;">
        <img src="${logoUrl}" alt="Logo" style="width:60px;height:60px;border-radius:50%;" />
        <p style="margin:10px 0 20px;">doTask Service Marketplace</p>
   
      </div>
    </div>
  `;
};

export default generateEmailTemplate;
