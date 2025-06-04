export const IP_CALL_LIMIT = 30;
export const IP_CALL_WINDOW = 60 * 1000;
export const MIN_TEXT_LENGTH = 10;
export const DEFAULT_SIMILARITY_THRESHOLD = 0.75;
export const DEFAULT_MAX_RESULTS = 3;
export const MIN_SIMILARITY_THRESHOLD = 0.1;
export const MAX_SIMILARITY_THRESHOLD = 0.99;
export const MAX_RAG_RESULTS = 5;
export const MIN_RAG_RESULTS = 1;
export const DEFAULT_LANGUAGE_CODE = 'en';
export const SUPPORTED_LANGUAGES = [
    'en',
    'fr',
    'de',
    'hi',
    'it',
    'pt',
    'es',
    'th',
    'zh',
    'ko',
    'ja',
];
export const LANGUAGE_CODE_MAP = {
    eng: 'en',
    fra: 'fr',
    deu: 'de',
    hin: 'hi',
    ita: 'it',
    por: 'pt',
    spa: 'es',
    tha: 'th',
    cmn: 'zh',
    kor: 'ko',
    jpn: 'ja',
};
export const WAITLIST_KEYS = {
    waitlist: 'waitlist:list',
    users: 'waitlist:users',
    emails: 'waitlist:emails',
    phones: 'waitlist:phones',
    signedUp: 'waitlist:signed_up',
};
export const RAG_CONTROLLER_RPC_FUNCTIONS = {
    hybridRAG: [
        'hybrid-rag',
        'user_id and text parameters are required',
        'hybrid_search_with_penalties',
        false,
    ],
    semanticRAG: [
        'semantic-rag',
        'user_id parameter is required',
        'search_similar_content_with_penalties',
        false,
    ],
    semanticRAGWithHashtags: [
        'semantic-rag-with-hashtags',
        'user_id and hashtags parameters are required',
        'search_similar_content_with_hashtags_and_penalties',
        true,
    ],
    hybridRAGWithHashtags: [
        'hybrid-rag-with-hashtags',
        'user_id, text, and hashtags parameters are required',
        'hybrid_search_with_hashtags_and_penalties',
        true,
    ],
};
export const REDIS_SCRIPTS = {
    getPositionByIdentifier: `
        local identifier = ARGV[1]
        
        -- Try to find user ID by email first
        local userId = redis.call('HGET', KEYS[2], identifier)
        if not userId then
            -- If not found by email, try phone
            userId = redis.call('HGET', KEYS[3], identifier)
        end
        
        if not userId then
            return 0
        end
        
        -- Find position in waitlist
        local items = redis.call('LRANGE', KEYS[1], 0, -1)
        for i, item in ipairs(items) do
            if item == userId then
                return i
            end
        end
        
        return 0
    `,
    isOnWaitlist: `
        local identifier = ARGV[1]
        
        -- Check email mapping
        local userId = redis.call('HGET', KEYS[1], identifier)
        if userId then
            return 1
        end
        
        -- Check phone mapping
        userId = redis.call('HGET', KEYS[2], identifier)
        if userId then
            return 1
        end
        
        return 0
    `,
    getPosition: `
        local id = ARGV[1]
        local items = redis.call('LRANGE', KEYS[1], 0, -1)
        for i, item in ipairs(items) do
            if item == id then
                return i
            end
        end
        return 0
    `,
    insertUser: `
        local id = ARGV[1]
        local email = ARGV[2]
        local phone = ARGV[3]
        local limit = tonumber(ARGV[4])
        local userDataJson = ARGV[5] -- Pass user data JSON to the script
        
        local userIdToUse = id
        local position = 0
        local existed = 0 -- 0 for new, 1 for existed
        
        -- Check if user exists by email
        if email ~= '' then
            local existingIdByEmail = redis.call('HGET', KEYS[2], email)
            if existingIdByEmail then
                userIdToUse = existingIdByEmail
                existed = 1
            end
        end
        
        -- Check if user exists by phone (only if not found by email)
        if existed == 0 and phone ~= '' then
            local existingIdByPhone = redis.call('HGET', KEYS[3], phone)
            if existingIdByPhone then
                 userIdToUse = existingIdByPhone
                 existed = 1
            end
        end

        -- If user existed, find their position
        if existed == 1 then
             local items = redis.call('LRANGE', KEYS[1], 0, -1)
             for i, item in ipairs(items) do
                 if item == userIdToUse then
                     position = i
                     break
                 end
             end
             -- Update user data if necessary (e.g., add metadata) - requires parsing existing and merging
             -- For simplicity, this script currently only retrieves position if exists.
             -- To update, you'd fetch HGET KEYS[4], userIdToUse, decode, merge, encode, HSET.
             redis.call('HSET', KEYS[4], userIdToUse, userDataJson) -- Overwrite/update user data if found
             return {position, existed, userIdToUse}
        end

        -- If new user, check limit and add
        local currentLength = redis.call('LLEN', KEYS[1])
        if currentLength >= limit then
            return {-1, -1, ''} -- Indicate limit reached
        end
        
        -- Add to end of list
        redis.call('RPUSH', KEYS[1], userIdToUse)
        position = currentLength + 1
        
        -- Set identifier mappings
        if email ~= '' then
            redis.call('HSET', KEYS[2], email, userIdToUse)
        end
        if phone ~= '' then
            redis.call('HSET', KEYS[3], phone, userIdToUse)
        end
        
        -- Store user data
        redis.call('HSET', KEYS[4], userIdToUse, userDataJson)
            
        return {position, existed, userIdToUse}
    `,
};
